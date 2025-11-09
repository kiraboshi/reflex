import type { CoreNode, CoreSystem, EventEnvelope, EventContext } from "@reflex/nexus-core/core";

/**
 * Example Connector Node
 * 
 * Connectors collect data or signals from external systems and emit signal.* events.
 * This is a simple example that can be extended for various data sources.
 */
export class WebConnectorNode {
  constructor(
    private readonly node: CoreNode,
    private readonly system: CoreSystem
  ) {}

  /**
   * Emit a web snapshot signal
   */
  async emitWebSnapshot(source: string, body: string): Promise<number> {
    return this.node.emit("signal.web.snapshot", {
      source,
      body,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit a stream raw signal
   */
  async emitStreamRaw(streamId: string, data: unknown): Promise<number> {
    return this.node.emit("signal.stream.raw", {
      streamId,
      data,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Scheduled Connector Node (Database-backed via pg_cron)
 * 
 * Listens for scheduled task trigger events from pg_cron and emits connector signals.
 * Each connector can specify its own event type, allowing the centralized router
 * to route directly to the correct handler without payload filtering.
 */
export class ScheduledConnectorNode {
  private count = 0;
  private readonly triggerEventType: string;
  private readonly signalEventType: string;
  private readonly signalPayload?: Record<string, unknown>;

  constructor(
    private readonly node: CoreNode,
    private readonly system: CoreSystem,
    triggerEventType: string,
    signalEventType: string = "signal.periodic.heartbeat",
    signalPayload?: Record<string, unknown>
  ) {
    this.triggerEventType = triggerEventType;
    this.signalEventType = signalEventType;
    this.signalPayload = signalPayload;
  }

  /**
   * Start listening for scheduled task trigger events
   * 
   * The router routes by eventType, so each connector registers for its specific
   * event type. This allows direct routing without payload inspection.
   */
  start(): void {
    console.log(`[Scheduled Connector] Listening for trigger events: ${this.triggerEventType}`);
    console.log(`[Scheduled Connector] Will emit: ${this.signalEventType}`);
    
    // Register handler for connector-specific event type
    // Router routes directly to this handler based on eventType
    this.node.onEvent(this.triggerEventType, async (event, context) => {
      await this.handleTrigger(event, context);
    });
  }

  /**
   * Stop listening (no-op for event-driven approach)
   */
  stop(): void {
    // Event handlers are automatically cleaned up when node stops
    console.log("[Scheduled Connector] Stopped listening for trigger events");
  }

  private async handleTrigger(
    event: EventEnvelope<Record<string, unknown>>,
    context: EventContext
  ): Promise<void> {
    this.count++;
    console.log(`[Scheduled Connector] Received trigger event #${this.count} from scheduled task`);
    
    // Build payload - merge scheduled task payload with connector payload
    const payload: Record<string, unknown> = {
      ...this.signalPayload,
      ...event.payload,
      count: this.count,
      timestamp: new Date().toISOString(),
      scheduledTaskId: event.scheduledTaskId
    };

    const messageId = await this.node.emit(this.signalEventType, payload);
    console.log(`[Scheduled Connector] Emitted ${this.signalEventType} #${this.count} (messageId: ${messageId})`);
  }
}

/**
 * Simple Periodic Connector (DEPRECATED - Use ScheduledConnectorNode instead)
 * Emits a heartbeat signal every N seconds using setInterval
 * 
 * @deprecated Use ScheduledConnectorNode with pg_cron for better reliability
 */
export class PeriodicConnectorNode {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private count = 0;

  constructor(
    private readonly node: CoreNode,
    private readonly system: CoreSystem,
    private readonly intervalSeconds: number = 10
  ) {}

  /**
   * Start emitting periodic signals
   */
  start(): void {
    console.log(`[Periodic Connector] Starting to emit signals every ${this.intervalSeconds} seconds`);
    console.log(`[Periodic Connector] WARNING: Using deprecated setInterval-based scheduling. Consider using scheduled connector with pg_cron.`);
    
    // Emit immediately
    this.emitSignal();
    
    // Then emit every interval
    this.intervalId = setInterval(() => {
      this.emitSignal();
    }, this.intervalSeconds * 1000);
  }

  /**
   * Stop emitting periodic signals
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[Periodic Connector] Stopped");
    }
  }

  private async emitSignal(): Promise<void> {
    this.count++;
    const messageId = await this.node.emit("signal.periodic.heartbeat", {
      value: true,
      count: this.count,
      timestamp: new Date().toISOString()
    });
    console.log(`[Periodic Connector] Emitted heartbeat #${this.count} (messageId: ${messageId})`);
  }
}

export function createConnectorNode(
  node: CoreNode,
  system: CoreSystem
): WebConnectorNode {
  return new WebConnectorNode(node, system);
}

export function createScheduledConnectorNode(
  node: CoreNode,
  system: CoreSystem,
  triggerEventType: string,
  signalEventType: string = "signal.periodic.heartbeat",
  signalPayload?: Record<string, unknown>
): ScheduledConnectorNode {
  return new ScheduledConnectorNode(node, system, triggerEventType, signalEventType, signalPayload);
}

/**
 * @deprecated Use createScheduledConnectorNode with pg_cron instead
 */
export function createPeriodicConnectorNode(
  node: CoreNode,
  system: CoreSystem,
  intervalSeconds: number = 10
): PeriodicConnectorNode {
  return new PeriodicConnectorNode(node, system, intervalSeconds);
}

