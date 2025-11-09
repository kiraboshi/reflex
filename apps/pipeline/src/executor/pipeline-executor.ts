/**
 * Pipeline Executor
 * 
 * Executes pipeline configurations by instantiating and connecting nodes
 */

import type { CoreSystem, CoreNode } from "@reflex/nexus-core/core";
import type { PipelineConfig, NodeDefinition } from "../config/pipeline-schema.ts";
import type { PipelineDatabase } from "../database.ts";
import { createPeriodicConnectorNode, createConnectorNode } from "../nodes/connectorNode.ts";
import { createEnrichNode } from "../nodes/enrichNode.ts";
import { createInterestFilterNode } from "../nodes/interestNode.ts";
import { createReactionNode } from "../nodes/reactionNode.ts";
import { createProcessNode } from "../nodes/processNode.ts";
import type { ConnectorConfig, EnricherConfig, InterestConfig } from "../config/pipeline-schema.ts";

export interface PipelineExecutor {
  start(): Promise<void>;
  stop(): Promise<void>;
  getNode(nodeId: string): CoreNode | undefined;
}

export class ConfigurablePipelineExecutor implements PipelineExecutor {
  private nodes: Map<string, CoreNode> = new Map();
  private nodeInstances: Map<string, unknown> = new Map();
  private connectors: Map<string, { start: () => void; stop: () => void }> = new Map();

  constructor(
    private readonly config: PipelineConfig,
    private readonly system: CoreSystem,
    private readonly pipelineDb: PipelineDatabase
  ) {}

  async start(): Promise<void> {
    console.log(`[Pipeline Executor] Starting pipeline: ${this.config.name}`);
    console.log(`[Pipeline Executor] Namespace: ${this.config.namespace}`);
    console.log(`[Pipeline Executor] Nodes: ${this.config.nodes.length}`);

    // Step 1: Register all CoreNodes
    for (const nodeDef of this.config.nodes) {
      await this.registerNode(nodeDef);
    }

    // Step 2: Create node instances and register handlers
    for (const nodeDef of this.config.nodes) {
      await this.createNodeInstance(nodeDef);
    }

    // Step 3: Start all nodes
    for (const nodeDef of this.config.nodes) {
      await this.startNode(nodeDef);
    }

    console.log(`[Pipeline Executor] Pipeline started successfully`);
  }

  async stop(): Promise<void> {
    console.log(`[Pipeline Executor] Stopping pipeline: ${this.config.name}`);
    
    // Stop connectors first
    for (const [nodeId, connector] of this.connectors) {
      console.log(`[Pipeline Executor] Stopping connector: ${nodeId}`);
      connector.stop();
    }
    this.connectors.clear();

    // Stop all nodes
    for (const [nodeId, node] of this.nodes) {
      console.log(`[Pipeline Executor] Stopping node: ${nodeId}`);
      await node.stop();
    }

    this.nodes.clear();
    this.nodeInstances.clear();
    console.log(`[Pipeline Executor] Pipeline stopped`);
  }

  getNode(nodeId: string): CoreNode | undefined {
    return this.nodes.get(nodeId);
  }

  private async registerNode(nodeDef: NodeDefinition): Promise<void> {
    const node = await this.system.registerNode({
      nodeId: nodeDef.id,
      displayName: nodeDef.displayName ?? `${nodeDef.type}-${nodeDef.id}`,
      description: nodeDef.description,
      metadata: {
        type: nodeDef.type,
        listensTo: nodeDef.listensTo,
        emits: nodeDef.emits ?? []
      }
    });

    this.nodes.set(nodeDef.id, node);
    console.log(`[Pipeline Executor] Registered node: ${nodeDef.id} (${nodeDef.type})`);
  }

  private async createNodeInstance(nodeDef: NodeDefinition): Promise<void> {
    const node = this.nodes.get(nodeDef.id);
    if (!node) {
      throw new Error(`Node not registered: ${nodeDef.id}`);
    }

    let instance: unknown;

    switch (nodeDef.type) {
      case "connector": {
        const connectorConfig = nodeDef.config as ConnectorConfig;
        if (connectorConfig.subtype === "periodic") {
          const intervalSeconds = (connectorConfig.params?.intervalSeconds as number) ?? 10;
          instance = createPeriodicConnectorNode(node, this.system, intervalSeconds);
          this.connectors.set(nodeDef.id, instance as { start: () => void; stop: () => void });
        } else {
          instance = createConnectorNode(node, this.system);
        }
        break;
      }

      case "enricher": {
        const enricherConfig = nodeDef.config as EnricherConfig;
        const enrichType = (enricherConfig.subtype ?? "web") as "web" | "metric" | "custom";
        instance = createEnrichNode(node, this.system, this.pipelineDb, enrichType);
        break;
      }

      case "interest": {
        instance = createInterestFilterNode(node, this.system, this.pipelineDb);
        break;
      }

      case "reaction": {
        instance = createReactionNode(node, this.system, this.pipelineDb, nodeDef);
        break;
      }

      case "process": {
        instance = createProcessNode(node, this.system, this.pipelineDb);
        break;
      }

      case "custom": {
        // Custom nodes would need custom handler loading
        throw new Error(`Custom node type not yet implemented: ${nodeDef.id}`);
      }

      default:
        throw new Error(`Unknown node type: ${nodeDef.type}`);
    }

    this.nodeInstances.set(nodeDef.id, instance);

    // Start the node instance if it has a start method
    if (instance && typeof instance === "object" && "start" in instance && typeof instance.start === "function") {
      (instance as { start: () => void }).start();
      console.log(`[Pipeline Executor] Started node instance: ${nodeDef.id}`);
    }
  }

  private async startNode(nodeDef: NodeDefinition): Promise<void> {
    const node = this.nodes.get(nodeDef.id);
    if (!node) {
      throw new Error(`Node not registered: ${nodeDef.id}`);
    }

    // Start the CoreNode (begins consuming from queue)
    await node.start();
    console.log(`[Pipeline Executor] Node consuming from queue: ${nodeDef.id}`);

    // If it's a connector with start method, start it
    const connector = this.connectors.get(nodeDef.id);
    if (connector) {
      connector.start();
      console.log(`[Pipeline Executor] Connector started emitting: ${nodeDef.id}`);
    }
  }
}

