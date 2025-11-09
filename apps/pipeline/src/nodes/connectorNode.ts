import type { CoreNode, CoreSystem } from "@reflex/nexus-core/core";

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
 * Simple Periodic Connector
 * Emits a heartbeat signal every N seconds
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

export function createPeriodicConnectorNode(
  node: CoreNode,
  system: CoreSystem,
  intervalSeconds: number = 10
): PeriodicConnectorNode {
  return new PeriodicConnectorNode(node, system, intervalSeconds);
}

