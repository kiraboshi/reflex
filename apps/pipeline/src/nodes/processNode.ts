import type { CoreNode, CoreSystem, EventEnvelope, EventContext } from "@reflex/nexus-core/core";
import type { PoolClient } from "pg";
import type { ReactionExecutedPayload } from "../types.ts";
import { emitFromTransaction } from "../utils.ts";
import type { PipelineDatabase } from "../database.ts";

/**
 * Process Node
 * 
 * Consumes domain events (interest matches, reaction results) and:
 * 1. Creates or updates process_instances (pipeline database)
 * 2. Manages workflow state transitions
 * 3. Emits process events (process.started, process.updated, incident.created)
 */
export class ProcessNode {
  constructor(
    private readonly node: CoreNode,
    private readonly system: CoreSystem,
    private readonly pipelineDb: PipelineDatabase
  ) {}

  start(): void {
    // Listen for reaction executions to create incidents
    this.node.onEvent("reaction.executed", async (event, context) => {
      console.log(`[Process] Received reaction.executed event`);
      await this.handleReactionExecuted(event, context);
    });

    // Listen for interest matches to start processes
    this.node.onEvent("interest.match", async (event, context) => {
      console.log(`[Process] Received interest.match event`);
      await this.handleInterestMatch(event, context);
    });

    // Listen for enriched events (for direct connector -> enrich -> process flow)
    this.node.onEvent("enriched.periodic.heartbeat", async (event, context) => {
      console.log(`[Process] Received enriched.periodic.heartbeat event`);
      await this.handleEnrichedEvent(event, context);
    });
  }

  private async handleReactionExecuted(
    event: EventEnvelope<ReactionExecutedPayload>,
    { client }: EventContext
  ): Promise<void> {
    const { ruleId, status } = event.payload;

    // If reaction failed, create an incident process
    if (status === "failed") {
      console.log(`[Process] Reaction failed for rule ${ruleId}, creating incident`);
      await this.createIncident(client, event, ruleId);
    }
  }

  private async handleInterestMatch(
    event: EventEnvelope,
    { client }: EventContext
  ): Promise<void> {
    // Example: Start a monitoring process for certain interest matches
    // This is customizable based on your domain logic
    const processType = this.determineProcessType(event);

    if (processType) {
      console.log(`[Process] Creating process: ${processType} triggered by ${event.eventType}`);
      const processId = await this.createOrUpdateProcess(
        client,
        event,
        processType,
        "started",
        { triggeredBy: event.eventType }
      );
      console.log(`[Process] Process created/updated: ${processId} (type: ${processType})`);
    } else {
      console.log(`[Process] No process type determined for event: ${event.eventType}`);
    }
  }

  private async createIncident(
    client: PoolClient,
    event: EventEnvelope,
    ruleId: string
  ): Promise<void> {
    // Use pipeline database for process_instances
    const { rows: existing } = await this.pipelineDb.query<{ process_id: string }>(
      `SELECT process_id FROM core.process_instances 
       WHERE namespace=$1 AND type='incident' AND state='open'
       ORDER BY created_at DESC LIMIT 1`,
      [event.namespace]
    );

    let processId: string;

    if (existing.length > 0) {
      // Update existing incident
      processId = existing[0].process_id;
      await this.pipelineDb.query(
        `UPDATE core.process_instances 
         SET data = jsonb_set(
           COALESCE(data, '{}'::jsonb),
           '{events}',
           COALESCE(data->'events', '[]'::jsonb) || $1::jsonb
         ),
         updated_at = now()
         WHERE process_id = $2`,
        [JSON.stringify(event), processId]
      );

      // Emit process.updated
      await this.emitProcessEvent(client, event.namespace, {
        processId,
        type: "incident",
        state: "open",
        eventType: "process.updated"
      });
    } else {
      // Create new incident - use pipeline database
      const { rows: newProcess } = await this.pipelineDb.query<{ process_id: string }>(
        `INSERT INTO core.process_instances 
         (namespace, type, state, data)
         VALUES ($1, 'incident', 'open', $2::jsonb)
         RETURNING process_id`,
        [
          event.namespace,
          JSON.stringify({
            ruleId,
            events: [event],
            createdAt: new Date().toISOString()
          })
        ]
      );

      processId = newProcess[0]?.process_id ?? "";

      // Emit process.started and incident.created
      const queueName = this.system.getQueueName();
      await emitFromTransaction(client, event.namespace, queueName, {
        namespace: event.namespace,
        eventType: "process.started",
        payload: { processId, type: "incident", state: "open" },
        emittedAt: new Date().toISOString(),
        producerNodeId: event.producerNodeId
      });

      await emitFromTransaction(client, event.namespace, queueName, {
        namespace: event.namespace,
        eventType: "incident.created",
        payload: { processId, ruleId, event },
        emittedAt: new Date().toISOString(),
        producerNodeId: event.producerNodeId
      });
    }
  }

  private async createOrUpdateProcess(
    client: PoolClient,
    event: EventEnvelope,
    processType: string,
    initialState: string,
    initialData: Record<string, unknown> = {}
  ): Promise<string> {
    // Use pipeline database for process_instances
    const { rows } = await this.pipelineDb.query<{ process_id: string }>(
      `INSERT INTO core.process_instances 
       (namespace, type, state, data)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING process_id`,
      [
        event.namespace,
        processType,
        initialState,
        JSON.stringify({
          ...initialData,
          events: [event],
          createdAt: new Date().toISOString()
        })
      ]
    );

    const processId = rows[0]?.process_id ?? "";
    
    console.log(`[Process] Inserted process into database: ${processId}`, {
      namespace: event.namespace,
      type: processType,
      state: initialState
    });

    if (processId) {
      await this.emitProcessEvent(client, event.namespace, {
        processId,
        type: processType,
        state: initialState,
        eventType: "process.started"
      });
    }
    
    return processId;
  }

  private async emitProcessEvent(
    client: PoolClient,
    namespace: string,
    payload: {
      processId: string;
      type: string;
      state: string;
      eventType: string;
    }
  ): Promise<void> {
    const queueName = this.system.getQueueName();
    await emitFromTransaction(client, namespace, queueName, {
      namespace,
      eventType: payload.eventType,
      payload,
      emittedAt: new Date().toISOString(),
      producerNodeId: "process-node"
    });
  }

  private async handleEnrichedEvent(
    event: EventEnvelope,
    { client }: EventContext
  ): Promise<void> {
    // For direct enriched events (without interest filter), create a process directly
    const processType = this.determineProcessType(event);
    if (processType) {
      console.log(`[Process] Creating process from enriched event: ${processType}`, {
        eventType: event.eventType,
        payload: event.payload
      });
      const processId = await this.createOrUpdateProcess(client, event, processType, "active");
      console.log(`[Process] Process created/updated: ${processId} (type: ${processType})`);
    } else {
      console.log(`[Process] No process type determined for event: ${event.eventType}`);
    }
  }

  private determineProcessType(event: EventEnvelope): string | null {
    // Customize based on your domain logic
    if (event.eventType.startsWith("interest.match")) {
      return "monitoring";
    }
    if (event.eventType.startsWith("enriched.periodic.heartbeat")) {
      return "heartbeat-monitoring";
    }
    if (event.eventType.startsWith("enriched.")) {
      return "enrichment-process";
    }
    return null;
  }
}

export function createProcessNode(
  node: CoreNode,
  system: CoreSystem,
  pipelineDb: PipelineDatabase
): ProcessNode {
  return new ProcessNode(node, system, pipelineDb);
}

