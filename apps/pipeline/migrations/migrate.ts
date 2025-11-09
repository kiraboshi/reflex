import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { existsSync } from "node:fs";

function requireEnv(key: string): string {
  let value: string | undefined;
  
  if (typeof process !== "undefined" && process.env) {
    value = process.env[key];
  } else if (typeof Deno !== "undefined" && Deno.env) {
    value = Deno.env.get(key);
  }
  
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  
  return value;
}

async function main() {
  // Load .env file if it exists (Node.js only)
  if (typeof process !== "undefined") {
    const envPaths = [".env", "./nexus-core/.env", "../.env"];
    for (const envPath of envPaths) {
      if (existsSync(envPath)) {
        config({ path: envPath });
        console.log(`[DEBUG] Loaded .env from: ${envPath}`);
        break;
      }
    }
  }

  const connectionString = requireEnv("REFLEX_DATABASE_URL");
  const pool = new Pool({ connectionString });

  try {
    console.log("Running observability pipeline migrations...");
    console.log(`[DEBUG] Database URL: ${connectionString.replace(/:([^:@]+)@/, ":****@")}`);

    // Get the directory of the current file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const migrationFile = join(__dirname, "001_observability_tables.sql");
    
    // Read SQL file - support both Node.js and Deno
    let sql: string;
    if (typeof readFileSync !== "undefined") {
      // Node.js
      sql = readFileSync(migrationFile, "utf-8");
    } else if (typeof Deno !== "undefined") {
      // Deno
      sql = await Deno.readTextFile(migrationFile);
    } else {
      throw new Error("Unable to read file - neither Node.js nor Deno APIs available");
    }

    console.log(`[DEBUG] Executing migration from: ${migrationFile}`);
    await pool.query(sql);
    console.log("✓ Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    if (error instanceof Error) {
      console.error("[DEBUG] Error details:", {
        message: error.message,
        stack: error.stack
      });
    }
    if (typeof process !== "undefined" && process.exit) {
      process.exit(1);
    } else if (typeof Deno !== "undefined" && Deno.exit) {
      Deno.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch(console.error);

