import type { CoreNode, CoreSystem, EventEnvelope, EventContext } from "@reflex/nexus-core/core";
import type { PoolClient } from "pg";
import type { InterestMatchPayload, ReactionExecutedPayload } from "../types.ts";
import { emitFromTransaction, generateDedupeKey } from "../utils.ts";
import type { PipelineDatabase } from "../database.ts";
import type { ReactionConfig, NodeDefinition } from "../config/pipeline-schema.ts";

/**
 * Reaction Node
 * 
 * Consumes events and executes actions:
 * 1. For `interest.match` events: Executes actions defined in the interest rule
 * 2. For other events: Executes actions from config
 * 3. Tracks executions in core.reaction_executions (pipeline database) for idempotency
 * 4. Emits `reaction.executed` events
 */
export class ReactionNode {
  private readonly actions: unknown[] = [];

  constructor(
    private readonly node: CoreNode,
    private readonly system: CoreSystem,
    private readonly pipelineDb: PipelineDatabase,
    private readonly nodeDef: NodeDefinition
  ) {
    const config = nodeDef.config as ReactionConfig;
    // Extract actions from config if provided
    if (config.actions) {
      this.actions = Array.isArray(config.actions) ? config.actions : [config.actions];
    }
  }

  start(): void {
    // Always listen to interest.match events
    this.node.onEvent("interest.match", async (event, context) => {
      console.log(`[Reaction] Received interest.match event`);
      await this.handleInterestMatch(event, context);
    });

    // Listen to other events specified in listensTo if actions are configured
    if (this.actions.length > 0) {
      for (const eventType of this.nodeDef.listensTo) {
        if (eventType !== "interest.match") {
          this.node.onEvent(eventType, async (event, context) => {
            console.log(`[Reaction] Received ${eventType} event`);
            await this.handleDirectEvent(event, context);
          });
        }
      }
    }
  }

  private async handleDirectEvent(
    event: EventEnvelope,
    { client }: EventContext
  ): Promise<void> {
    // Execute actions from config for direct events
    for (let actionIndex = 0; actionIndex < this.actions.length; actionIndex++) {
      const action = this.actions[actionIndex];
      const dedupeKey = await generateDedupeKey(
        event.namespace,
        `direct-${event.eventType}`,
        actionIndex,
        event
      );

      try {
        // Check if already executed (idempotency) - use pipeline database
        const { rows: existing } = await this.pipelineDb.query<{ execution_id: string }>(
          `SELECT execution_id FROM core.reaction_executions 
           WHERE namespace=$1 AND dedupe_key=$2`,
          [event.namespace, dedupeKey]
        );

        if (existing.length > 0) {
          // Already executed, skip
          continue;
        }

        // Insert execution record as pending - use pipeline database
        const { rows: execRows } = await this.pipelineDb.query<{ execution_id: string }>(
          `INSERT INTO core.reaction_executions 
           (namespace, rule_id, action_index, dedupe_key, status)
           VALUES ($1, $2, $3, $4, 'pending')
           RETURNING execution_id`,
          [event.namespace, `direct-${event.eventType}`, actionIndex, dedupeKey]
        );

        const executionId = execRows[0]?.execution_id;

        // Execute the action
        console.log(`[Reaction] Executing action: ${(action as { type?: string }).type ?? "unknown"} for event ${event.eventType}`);
        const result = await this.executeAction(action, event);

        // Update execution record - use pipeline database
        await this.pipelineDb.query(
          `UPDATE core.reaction_executions 
           SET status=$1, external_ref=$2, updated_at=now()
           WHERE execution_id=$3`,
          [result.status, result.externalRef ?? null, executionId]
        );

        console.log(`[Reaction] Action completed: ${(action as { type?: string }).type ?? "unknown"} - status: ${result.status}`);

        // Emit reaction.executed event
        const queueName = this.system.getQueueName();
        await emitFromTransaction(client, event.namespace, queueName, {
          namespace: event.namespace,
          eventType: "reaction.executed",
          payload: {
            executionId,
            ruleId: `direct-${event.eventType}`,
            actionIndex,
            status: result.status,
            externalRef: result.externalRef,
            error: result.error
          } as ReactionExecutedPayload,
          emittedAt: new Date().toISOString(),
          producerNodeId: event.producerNodeId
        });
      } catch (error) {
        // Mark execution as failed - use pipeline database
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.pipelineDb.query(
          `INSERT INTO core.reaction_executions 
           (namespace, rule_id, action_index, dedupe_key, status, error)
           VALUES ($1, $2, $3, $4, 'failed', $5)
           ON CONFLICT (namespace, dedupe_key) 
           DO UPDATE SET status='failed', error=EXCLUDED.error, updated_at=now()`,
          [event.namespace, `direct-${event.eventType}`, actionIndex, dedupeKey, errorMessage]
        );

        // Emit reaction.executed with failure status
        const queueName = this.system.getQueueName();
        await emitFromTransaction(client, event.namespace, queueName, {
          namespace: event.namespace,
          eventType: "reaction.executed",
          payload: {
            executionId: "",
            ruleId: `direct-${event.eventType}`,
            actionIndex,
            status: "failed",
            error: errorMessage
          } as ReactionExecutedPayload,
          emittedAt: new Date().toISOString(),
          producerNodeId: event.producerNodeId
        });
      }
    }
  }

  private async handleInterestMatch(
    event: EventEnvelope<InterestMatchPayload>,
    { client }: EventContext
  ): Promise<void> {
    const { ruleId, actions, event: matchedEvent } = event.payload;

    // Execute each action
    for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
      const action = actions[actionIndex];
      const dedupeKey = await generateDedupeKey(
        event.namespace,
        ruleId,
        actionIndex,
        matchedEvent
      );

      try {
        // Check if already executed (idempotency) - use pipeline database
        const { rows: existing } = await this.pipelineDb.query<{ execution_id: string }>(
          `SELECT execution_id FROM core.reaction_executions 
           WHERE namespace=$1 AND dedupe_key=$2`,
          [event.namespace, dedupeKey]
        );

        if (existing.length > 0) {
          // Already executed, skip
          continue;
        }

        // Insert execution record as pending - use pipeline database
        const { rows: execRows } = await this.pipelineDb.query<{ execution_id: string }>(
          `INSERT INTO core.reaction_executions 
           (namespace, rule_id, action_index, dedupe_key, status)
           VALUES ($1, $2, $3, $4, 'pending')
           RETURNING execution_id`,
          [event.namespace, ruleId, actionIndex, dedupeKey]
        );

        const executionId = execRows[0]?.execution_id;

        // Execute the action
        console.log(`[Reaction] Executing action: ${action.type} for rule ${ruleId}`);
        const result = await this.executeAction(action, matchedEvent);

        // Update execution record - use pipeline database
        await this.pipelineDb.query(
          `UPDATE core.reaction_executions 
           SET status=$1, external_ref=$2, updated_at=now()
           WHERE execution_id=$3`,
          [result.status, result.externalRef ?? null, executionId]
        );

        console.log(`[Reaction] Action completed: ${action.type} - status: ${result.status}`);

        // Emit reaction.executed event
        const queueName = this.system.getQueueName();
        await emitFromTransaction(client, event.namespace, queueName, {
          namespace: event.namespace,
          eventType: "reaction.executed",
          payload: {
            executionId,
            ruleId,
            actionIndex,
            status: result.status,
            externalRef: result.externalRef,
            error: result.error
          } as ReactionExecutedPayload,
          emittedAt: new Date().toISOString(),
          producerNodeId: event.producerNodeId
        });
      } catch (error) {
        // Mark execution as failed - use pipeline database
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.pipelineDb.query(
          `INSERT INTO core.reaction_executions 
           (namespace, rule_id, action_index, dedupe_key, status, error)
           VALUES ($1, $2, $3, $4, 'failed', $5)
           ON CONFLICT (namespace, dedupe_key) 
           DO UPDATE SET status='failed', error=EXCLUDED.error, updated_at=now()`,
          [event.namespace, ruleId, actionIndex, dedupeKey, errorMessage]
        );

        // Emit reaction.executed with failure status
        const queueName = this.system.getQueueName();
        await emitFromTransaction(client, event.namespace, queueName, {
          namespace: event.namespace,
          eventType: "reaction.executed",
          payload: {
            executionId: "",
            ruleId,
            actionIndex,
            status: "failed",
            error: errorMessage
          } as ReactionExecutedPayload,
          emittedAt: new Date().toISOString(),
          producerNodeId: event.producerNodeId
        });
      }
    }
  }

  private async executeAction(
    action: unknown,
    event: EventEnvelope
  ): Promise<{ status: "completed" | "failed"; externalRef?: string; error?: string }> {
    // Parse action type
    const actionObj = action as { type: string; [key: string]: unknown };

    try {
      switch (actionObj.type) {
        case "echo":
          return await this.echo(actionObj, event);
        case "slack_notification":
          return await this.sendSlackNotification(actionObj, event);
        case "emit_event":
          return await this.emitEvent(actionObj, event);
        case "create_ticket":
          return await this.createTicket(actionObj, event);
        default:
          return {
            status: "failed",
            error: `Unknown action type: ${actionObj.type}`
          };
      }
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async echo(
    action: { type: string; message?: string },
    event: EventEnvelope
  ): Promise<{ status: "completed" | "failed"; externalRef?: string; error?: string }> {
    const message = action.message ?? "Heartbeat received";
    console.log(`[Reaction Echo] ${message}`, {
      eventType: event.eventType,
      payload: event.payload,
      emittedAt: event.emittedAt
    });

    return {
      status: "completed",
      externalRef: `echo-${Date.now()}`
    };
  }

  private async sendSlackNotification(
    action: { type: string; webhook?: string; message?: string },
    event: EventEnvelope
  ): Promise<{ status: "completed" | "failed"; externalRef?: string; error?: string }> {
    // In production, implement actual Slack webhook call
    console.log(`[Slack] ${action.message ?? "Notification"}`, {
      eventType: event.eventType,
      payload: event.payload
    });

    return {
      status: "completed",
      externalRef: `slack-${Date.now()}`
    };
  }

  private async emitEvent(
    action: { type: string; eventType?: string; payload?: unknown },
    event: EventEnvelope
  ): Promise<{ status: "completed" | "failed"; externalRef?: string; error?: string }> {
    // This would typically emit via the node, but we're in a transaction
    // The event will be emitted via emitFromTransaction
    console.log(`[Emit Event] ${action.eventType}`, action.payload);

    return {
      status: "completed",
      externalRef: `event-${action.eventType}`
    };
  }

  private async createTicket(
    action: { type: string; system?: string; title?: string },
    event: EventEnvelope
  ): Promise<{ status: "completed" | "failed"; externalRef?: string; error?: string }> {
    // In production, implement actual ticket creation
    console.log(`[Create Ticket] ${action.title ?? "Ticket"}`, {
      system: action.system,
      eventType: event.eventType
    });

    return {
      status: "completed",
      externalRef: `ticket-${Date.now()}`
    };
  }
}

export function createReactionNode(
  node: CoreNode,
  system: CoreSystem,
  pipelineDb: PipelineDatabase,
  nodeDef: NodeDefinition
): ReactionNode {
  return new ReactionNode(node, system, pipelineDb, nodeDef);
}

