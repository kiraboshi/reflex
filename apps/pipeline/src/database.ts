import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type { CoreLogger } from "@reflex/nexus-core/core";

/**
 * Pipeline Database - Separate database connection for pipeline-specific tables
 * This is separate from the nexus-core database connection
 */
export class PipelineDatabase {
  private constructor(
    private readonly pool: Pool,
    private readonly logger: CoreLogger
  ) {}

  static async connect(connectionString: string, logger: CoreLogger): Promise<PipelineDatabase> {
    // Debug logging for connection string (mask password)
    const maskedUrl = connectionString.replace(/:([^:@]+)@/, ":****@");
    logger.info("Creating pipeline database pool", { connectionString: maskedUrl });
    
    const pool = new Pool({ connectionString });
    const db = new PipelineDatabase(pool, logger);
    
    // Validate connection early to fail fast.
    logger.info("Validating pipeline database connection...");
    try {
      await db.usingClient(async (client) => {
        await client.query("select 1");
      });
      logger.info("Connected to pipeline database");
    } catch (error) {
      logger.error("Pipeline database connection validation failed", {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        connectionString: maskedUrl
      });
      throw error;
    }
    return db;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>
  ) {
    return this.pool.query<T>(text, params ? [...params] : undefined);
  }

  async usingClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    try {
      const client = await this.pool.connect();
      try {
        return await fn(client);
      } finally {
        client.release();
      }
    } catch (error) {
      this.logger.error("Failed to acquire pipeline database client", {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.usingClient(async (client) => {
      await client.query("begin");
      try {
        const result = await fn(client);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    });
  }

  async close(): Promise<void> {
    this.logger.info("Closing pipeline database pool");
    await this.pool.end();
  }

  getPool(): Pool {
    return this.pool;
  }
}

