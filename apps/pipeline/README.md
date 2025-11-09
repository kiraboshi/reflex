# Observability Pipeline

This package implements the observability pipeline specification on top of the PostgreSQL event system.

## Architecture

The pipeline follows this flow:

```
Connector → Signal → Enrich/State → Interest Filter → Reaction → Process
```

### Pipeline Stages

1. **Connector**: Collects data from external systems, emits `signal.*` events
2. **Signal**: Normalized signal events (already handled by connectors)
3. **Enrich/State**: Processes signals into enriched events, updates `core.entity_state`
4. **Interest Filter**: Evaluates enrichment events against `core.interest_rules`, emits `interest.match`
5. **Reaction**: Executes actions, tracks in `core.reaction_executions`, emits `reaction.executed`
6. **Process**: Manages workflows in `core.process_instances`, emits `process.*` events

## Database Schema

The pipeline extends the core event system with these tables:

- `core.entity_state` - Stores derived state per entity
- `core.interest_rules` - Declarative matching rules
- `core.reaction_executions` - Tracks side-effect execution for idempotency
- `core.process_instances` - Long-running workflows

## Setup

1. Run migrations:
```bash
npm run migrate
```

2. Set environment variables:
```bash
CORE_DATABASE_URL=postgres://postgres:postgres@localhost:5432/core
CORE_NAMESPACE=observability
```

3. Run the example:
```bash
npm run dev
```

## Usage

### Creating Nodes

```typescript
import { CoreSystem } from "@reflex/nexus-core/core";
import { createEnrichNode, createInterestFilterNode } from "@reflex/pipeline";

const system = await CoreSystem.connect({
  connectionString: process.env.CORE_DATABASE_URL,
  namespace: "my-namespace"
});

const node = await system.registerNode({
  nodeId: "enricher-1",
  displayName: "Content Enricher"
});

const enricher = createEnrichNode(node, system, "web");
enricher.start();
await node.start();
```

### Creating Interest Rules

```sql
INSERT INTO core.interest_rules 
(namespace, rule_id, name, event_type, condition_expr, actions, enabled)
VALUES (
  'my-namespace',
  'alert-on-change',
  'Alert on Content Change',
  'enriched.web.content_delta',
  'payload.summary === "Content changed"',
  '[{"type": "slack_notification", "message": "Content changed!"}]'::jsonb,
  TRUE
);
```

## Example: Website Update Detection

See `src/examples/webUpdateDetection.ts` for a complete end-to-end example.

