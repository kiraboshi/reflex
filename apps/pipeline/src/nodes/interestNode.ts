import type { CoreNode, CoreSystem, EventEnvelope, EventContext } from "@reflex/nexus-core/core";
import type { PoolClient } from "pg";
import type { InterestRule } from "../types.ts";
import { emitFromTransaction, evalCondition } from "../utils.ts";
import type { PipelineDatabase } from "../database.ts";

/**
 * Interest Filter Node
 * 
 * Consumes `enriched.*` events and:
 * 1. Loads applicable rules from core.interest_rules (pipeline database)
 * 2. Evaluates condition_expr against event payload
 * 3. Emits `interest.match` for matching rules
 */
export class InterestFilterNode {
  constructor(
    private readonly node: CoreNode,
    private readonly system: CoreSystem,
    private readonly pipelineDb: PipelineDatabase
  ) {}

  start(): void {
    // Register handler for all enriched.* events
    // In practice, you might want to register specific event types
    this.node.onEvent("enriched.web.content_delta", async (event, context) => {
      await this.handleEnrichedEvent(event, context);
    });

    // Add more enriched event types as needed
    this.node.onEvent("enriched.metric.aggregated", async (event, context) => {
      await this.handleEnrichedEvent(event, context);
    });
    
    // Handle periodic heartbeat events for simple testing
    this.node.onEvent("enriched.periodic.heartbeat", async (event, context) => {
      await this.handleEnrichedEvent(event, context);
    });
    
    // Ignore signal events - they should be processed by enrichers first
    // Throw special error to skip acknowledgment so message becomes visible again
    this.node.onEvent("signal.periodic.heartbeat", async (event, context) => {
      // Interest filter doesn't process signal events - they need enrichment first
      // Throw special error to prevent acknowledgment - message will become visible again
      console.log(`[Interest Filter] Skipping signal event (will become visible again for enricher): ${event.eventType}`);
      const skipError = new Error("Skip acknowledgment - let enricher process this");
      skipError.name = "SkipAcknowledgmentError";
      throw skipError;
    });
  }

  private async handleEnrichedEvent(
    event: EventEnvelope,
    { client }: EventContext
  ): Promise<void> {
    console.log(`[Interest Filter] Received event: ${event.eventType}`, { namespace: event.namespace });
    
    // Load applicable rules from pipeline database
    const { rows: rules } = await this.pipelineDb.query<InterestRule>(
      `SELECT * FROM core.interest_rules 
       WHERE namespace=$1 AND event_type=$2 AND enabled=TRUE`,
      [event.namespace, event.eventType]
    );

    console.log(`[Interest Filter] Found ${rules.length} rule(s) for event type ${event.eventType}`);

    if (rules.length === 0) {
      console.log(`[Interest Filter] No rules found for ${event.eventType} in namespace ${event.namespace}`);
      return;
    }

    // Evaluate each rule
    for (const rule of rules) {
      try {
        console.log(`[Interest Filter] Evaluating rule: ${rule.name} (${rule.rule_id})`, { 
          condition: rule.condition_expr,
          payload: event.payload 
        });
        const matches = evalCondition(rule.condition_expr, event.payload);
        console.log(`[Interest Filter] Rule ${rule.name} evaluation result: ${matches}`);

        if (matches) {
          console.log(`[Interest Filter] Rule matched: ${rule.name} (${rule.rule_id})`);
          // Emit interest match event
          const queueName = this.system.getQueueName();
          await emitFromTransaction(client, event.namespace, queueName, {
            namespace: event.namespace,
            eventType: "interest.match",
            payload: {
              ruleId: rule.rule_id,
              ruleName: rule.name,
              event,
              actions: rule.actions
            },
            emittedAt: new Date().toISOString(),
            producerNodeId: event.producerNodeId
          });
          console.log(`[Interest Filter] Emitted interest.match for rule ${rule.rule_id}`);
        }
      } catch (error) {
        console.error(`[Interest Filter] Error evaluating rule ${rule.rule_id}:`, error);
        // Continue with other rules even if one fails
      }
    }
  }
}

export function createInterestFilterNode(
  node: CoreNode,
  system: CoreSystem,
  pipelineDb: PipelineDatabase
): InterestFilterNode {
  return new InterestFilterNode(node, system, pipelineDb);
}

