-- Observability Pipeline Tables
-- Extends the core event system with enrichment, interest filtering, reactions, and processes

-- Ensure core schema exists
CREATE SCHEMA IF NOT EXISTS core;

-- Entity State: Stores derived, durable state per entity
CREATE TABLE IF NOT EXISTS core.entity_state (
  namespace      TEXT        NOT NULL,
  entity_type    TEXT        NOT NULL,
  entity_id      TEXT        NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  data           JSONB       NOT NULL,
  PRIMARY KEY (namespace, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_state_namespace_type ON core.entity_state(namespace, entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_state_updated_at ON core.entity_state(updated_at);

-- Interest Rules: Declarative matching rules for enrichment events
CREATE TABLE IF NOT EXISTS core.interest_rules (
  namespace       TEXT        NOT NULL,
  rule_id         TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  event_type      TEXT        NOT NULL,
  condition_expr  TEXT        NOT NULL,
  actions         JSONB       NOT NULL,
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_interest_rules_namespace_event_type ON core.interest_rules(namespace, event_type) WHERE enabled = TRUE;

-- Reaction Executions: Tracks side-effect execution for idempotency and audit
CREATE TABLE IF NOT EXISTS core.reaction_executions (
  namespace       TEXT        NOT NULL,
  execution_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         TEXT        NOT NULL,
  action_index    INTEGER     NOT NULL,
  dedupe_key      TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending',
  error           TEXT,
  external_ref    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (namespace, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_reaction_executions_namespace_rule ON core.reaction_executions(namespace, rule_id);
CREATE INDEX IF NOT EXISTS idx_reaction_executions_status ON core.reaction_executions(status) WHERE status = 'pending';

-- Process Instances: Long-running workflows
CREATE TABLE IF NOT EXISTS core.process_instances (
  namespace       TEXT        NOT NULL,
  process_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT        NOT NULL,
  state           TEXT        NOT NULL,
  data            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_process_instances_namespace_type ON core.process_instances(namespace, type);
CREATE INDEX IF NOT EXISTS idx_process_instances_state ON core.process_instances(namespace, state);

