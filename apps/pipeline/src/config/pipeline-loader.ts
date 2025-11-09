/**
 * Pipeline Loader
 * 
 * Loads and validates pipeline configurations from JSON files
 */

import type { PipelineConfig } from "./pipeline-schema.ts";

export async function loadPipelineConfig(configPath: string): Promise<PipelineConfig> {
  try {
    const configText = await Deno.readTextFile(configPath);
    const config = JSON.parse(configText) as PipelineConfig;
    
    // Validate basic structure
    if (!config.name || !config.namespace || !Array.isArray(config.nodes)) {
      throw new Error("Invalid pipeline config: missing required fields (name, namespace, nodes)");
    }
    
    // Validate nodes
    for (const node of config.nodes) {
      if (!node.id || !node.type || !Array.isArray(node.listensTo)) {
        throw new Error(`Invalid node definition: ${node.id} missing required fields`);
      }
    }
    
    return config;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`Pipeline config file not found: ${configPath}`);
    }
    throw error;
  }
}

export function validatePipelineConfig(config: PipelineConfig): void {
  // Check for duplicate node IDs
  const nodeIds = new Set<string>();
  for (const node of config.nodes) {
    if (nodeIds.has(node.id)) {
      throw new Error(`Duplicate node ID: ${node.id}`);
    }
    nodeIds.add(node.id);
  }
  
  // Validate node types
  const validTypes = ["connector", "enricher", "interest", "reaction", "process", "custom"];
  for (const node of config.nodes) {
    if (!validTypes.includes(node.type)) {
      throw new Error(`Invalid node type: ${node.type} (valid types: ${validTypes.join(", ")})`);
    }
  }
}

