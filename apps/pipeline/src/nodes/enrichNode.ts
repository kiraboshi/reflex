import type { CoreNode, CoreSystem, EventEnvelope, EventContext } from "@reflex/nexus-core/core";
import type { PoolClient } from "pg";
import { emitFromTransaction, normalizeHtml, sha256 } from "../utils.ts";
import type { PipelineDatabase } from "../database.ts";

/**
 * Web Content Delta Enricher Node
 * 
 * Consumes `signal.web.snapshot` events and:
 * 1. Normalizes HTML content
 * 2. Computes content hash
 * 3. Compares with previous state in entity_state (pipeline database)
 * 4. Emits `enriched.web.content_delta` if content changed
 */
export class WebContentEnrichNode {
  constructor(
    private readonly node: CoreNode,
    private readonly system: CoreSystem,
    private readonly pipelineDb: PipelineDatabase
  ) {}

  start(): void {
    this.node.onEvent("signal.web.snapshot", async (event, context) => {
      await this.handleWebSnapshot(event, context);
    });
    
    // Also handle periodic heartbeat signals for simple testing
    this.node.onEvent("signal.periodic.heartbeat", async (event, context) => {
      await this.handlePeriodicHeartbeat(event, context);
    });
  }

  private async handleWebSnapshot(
    event: EventEnvelope<{ source: string; body: string }>,
    { client }: EventContext
  ): Promise<void> {
    const { source, body } = event.payload;
    const normalized = normalizeHtml(body);
    const hash = await sha256(normalized);

    // Get previous state from pipeline database (separate connection)
    // Note: This is outside the core transaction, but pipeline state is separate
    const { rows } = await this.pipelineDb.query<{ data: Record<string, unknown> }>(
      `SELECT data FROM core.entity_state 
       WHERE namespace=$1 AND entity_type='url' AND entity_id=$2`,
      [event.namespace, source]
    );

    const prev = rows[0]?.data;
    const changed = !prev?.hash || prev.hash !== hash;

    // Update entity state in pipeline database
    await this.pipelineDb.query(
      `INSERT INTO core.entity_state(namespace, entity_type, entity_id, data)
       VALUES ($1, 'url', $2, $3::jsonb)
       ON CONFLICT (namespace, entity_type, entity_id)
       DO UPDATE SET data=EXCLUDED.data, updated_at=now()`,
      [event.namespace, source, JSON.stringify({ hash, normalized })]
    );

    // Emit enriched event if content changed
    if (changed) {
      console.log(`[Enricher] Content changed for ${source}, emitting enriched.web.content_delta`);
      const queueName = this.system.getQueueName();
      await emitFromTransaction(client, event.namespace, queueName, {
        namespace: event.namespace,
        eventType: "enriched.web.content_delta",
        payload: {
          source,
          summary: "Content changed",
          hash,
          previousHash: prev?.hash
        },
        emittedAt: new Date().toISOString(),
        producerNodeId: event.producerNodeId
      });
    } else {
      console.log(`[Enricher] No content change detected for ${source}`);
    }
  }

  private async handlePeriodicHeartbeat(
    event: EventEnvelope<{ value: boolean; count: number; timestamp: string }>,
    { client }: EventContext
  ): Promise<void> {
    const { value, count } = event.payload;
    console.log(`[Enricher] Processing periodic heartbeat #${count}, value: ${value}`);
    
    // Always emit enriched event for periodic heartbeats (simpler for testing)
    const queueName = this.system.getQueueName();
    await emitFromTransaction(client, event.namespace, queueName, {
      namespace: event.namespace,
      eventType: "enriched.periodic.heartbeat",
      payload: {
        value,
        count,
        processed: true,
        processedAt: new Date().toISOString()
      },
      emittedAt: new Date().toISOString(),
      producerNodeId: event.producerNodeId
    });
    console.log(`[Enricher] Emitted enriched.periodic.heartbeat for heartbeat #${count}`);
  }
}

/**
 * Generic Enrichment Node Factory
 * Can be extended for other enrichment types
 */
export function createEnrichNode(
  node: CoreNode,
  system: CoreSystem,
  pipelineDb: PipelineDatabase,
  enrichType: "web" | "metric" | "custom" = "web"
): WebContentEnrichNode | null {
  if (enrichType === "web") {
    return new WebContentEnrichNode(node, system, pipelineDb);
  }
  return null;
}

