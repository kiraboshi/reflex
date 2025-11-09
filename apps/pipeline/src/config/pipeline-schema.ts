/**
 * Pipeline Configuration Schema
 * 
 * Defines the structure for JSON-based pipeline configurations
 * that allow arbitrary node connections and flows.
 */

export interface PipelineConfig {
  /** Pipeline name/identifier */
  name: string;
  /** Pipeline description */
  description?: string;
  /** Namespace for this pipeline */
  namespace: string;
  /** Array of node definitions */
  nodes: NodeDefinition[];
}

export interface NodeDefinition {
  /** Unique node ID within the pipeline */
  id: string;
  /** Node type: connector, enricher, interest, reaction, process, or custom */
  type: "connector" | "enricher" | "interest" | "reaction" | "process" | "custom";
  /** Display name for the node */
  displayName?: string;
  /** Description of what this node does */
  description?: string;
  /** Event types this node listens to (consumes) */
  listensTo: string[];
  /** Event types this node emits (produces) */
  emits?: string[];
  /** Type-specific configuration */
  config: NodeConfig;
}

export interface ConnectorConfig {
  /** Connector subtype */
  subtype: "periodic" | "web" | "stream" | "custom";
  /** Configuration specific to connector subtype */
  params?: Record<string, unknown>;
}

export interface EnricherConfig {
  /** Enricher subtype */
  subtype: "web" | "metric" | "custom";
  /** Configuration specific to enricher subtype */
  params?: Record<string, unknown>;
}

export interface InterestConfig {
  /** Whether to load rules from database */
  loadRulesFromDb?: boolean;
  /** Inline rules (alternative to database) */
  rules?: InterestRule[];
}

export interface InterestRule {
  ruleId: string;
  name: string;
  eventType: string;
  conditionExpr: string;
  actions: unknown[];
  enabled?: boolean;
}

export interface ReactionConfig {
  /** Whether to track executions in database */
  trackExecutions?: boolean;
  /** Actions to execute when events are received (array of action objects) */
  actions?: unknown[];
}

export interface ProcessConfig {
  /** Process type mapping */
  processTypes?: Record<string, string>;
  /** Whether to create incidents on failures */
  createIncidents?: boolean;
}

export interface CustomNodeConfig {
  /** Custom handler module path or identifier */
  handler?: string;
  /** Custom configuration */
  params?: Record<string, unknown>;
}

export type NodeConfig = 
  | ConnectorConfig 
  | EnricherConfig 
  | InterestConfig 
  | ReactionConfig 
  | ProcessConfig 
  | CustomNodeConfig;

