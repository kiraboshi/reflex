import type { EventEnvelope } from "@reflex/nexus-core/core";

export interface EntityState {
  namespace: string;
  entityType: string;
  entityId: string;
  updatedAt: string;
  data: Record<string, unknown>;
}

export interface InterestRule {
  namespace: string;
  ruleId: string;
  name: string;
  eventType: string;
  conditionExpr: string;
  actions: unknown[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReactionExecution {
  namespace: string;
  executionId: string;
  ruleId: string;
  actionIndex: number;
  dedupeKey: string;
  status: "pending" | "completed" | "failed";
  error?: string;
  externalRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessInstance {
  namespace: string;
  processId: string;
  type: string;
  state: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface InterestMatchPayload {
  ruleId: string;
  event: EventEnvelope;
  actions: unknown[];
}

export interface ReactionExecutedPayload {
  executionId: string;
  ruleId: string;
  actionIndex: number;
  status: "completed" | "failed";
  externalRef?: string;
  error?: string;
}

