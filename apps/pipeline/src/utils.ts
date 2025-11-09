import type { PoolClient } from "pg";
import type { EventEnvelope } from "@reflex/nexus-core/core";

/**
 * Emit an event from within a transaction.
 * This function sends the event to the queue and appends it to the event log
 * atomically within the same transaction.
 */
export async function emitFromTransaction(
  client: PoolClient,
  namespace: string,
  queueName: string,
  envelope: Omit<EventEnvelope, "messageId" | "redeliveryCount">
): Promise<void> {
  const { rows: sendRows } = await client.query<{ send: number }>(
    `SELECT pgmq.send($1, $2::jsonb) AS send`,
    [queueName, envelope]
  );

  const messageId = sendRows[0]?.send ?? 0;

  await client.query(
    `SELECT core.append_event_log($1, $2, $3::jsonb, $4, $5, $6::jsonb)`,
    [
      envelope.namespace,
      envelope.eventType,
      envelope.payload ?? {},
      envelope.producerNodeId,
      envelope.scheduledTaskId ?? null,
      {
        messageId,
        redeliveryCount: 0
      }
    ]
  );
}

/**
 * Normalize HTML content for comparison
 */
export function normalizeHtml(html: string): string {
  return html
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

/**
 * Compute SHA-256 hash of content
 */
export async function sha256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Evaluate a condition expression against event payload.
 * 
 * WARNING: This implementation uses eval() which is unsafe for untrusted input.
 * In production, use a proper expression evaluator like:
 * - jsonpath-plus
 * - jexl
 * - A sandboxed JavaScript execution environment
 * 
 * For now, this supports simple JavaScript expressions like:
 * - payload.summary === "Content changed"
 * - payload.value > 100
 * - payload.tags && payload.tags.includes("urgent")
 */
export function evalCondition(conditionExpr: string, payload: unknown): boolean {
  try {
    // Create a safe context object
    const context = { payload };
    
    // Wrap in a function to limit scope
    // eslint-disable-next-line no-eval
    const fn = new Function("payload", `return (${conditionExpr})`);
    return Boolean(fn(payload));
  } catch (error) {
    console.error("Condition evaluation error:", error, { conditionExpr, payload });
    return false;
  }
}

/**
 * Generate a deduplication key for reaction execution
 */
export async function generateDedupeKey(
  namespace: string,
  ruleId: string,
  actionIndex: number,
  event: EventEnvelope
): Promise<string> {
  const keyParts = [
    namespace,
    ruleId,
    actionIndex.toString(),
    event.eventType,
    JSON.stringify(event.payload)
  ];
  return await sha256(keyParts.join("|"));
}

