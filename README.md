# Reflex Observability Pipeline

A PostgreSQL-native observability and automation pipeline built on top of the nexus-core event system.

## Architecture

The pipeline implements a complete observability flow:

```
Connector → Signal → Enrich/State → Interest Filter → Reaction → Process
```

### Components

- **Connector Nodes**: Collect data from external systems, emit `signal.*` events
- **Enrich/State Nodes**: Process signals into enriched events, maintain entity state
- **Interest Filter Nodes**: Evaluate events against declarative rules, emit `interest.match`
- **Reaction Nodes**: Execute actions (notifications, tickets, etc.), track executions
- **Process Nodes**: Manage workflows and long-running processes

## Quick Start

### Prerequisites

- PostgreSQL with extensions: `pgmq`, `pg_cron`, `pg_partman`
- Deno 1.40+ ([Install Deno](https://deno.land/#installation))

### Setup

1. Clone the repository:
```bash
git clone <repo-url>
cd reflex
```

2. Set up environment variables:
```bash
cp nexus-core/example.env .env
# Edit .env with your database connection
```

3. Run migrations:
```bash
deno task migrate
```

4. Run the example:
```bash
deno task pipeline:example
```

## Project Structure

```
.
├── nexus-core/          # Core event system library (submodule)
│   └── src/
│       ├── core/        # Core event system implementation
│       ├── apps/        # Server and worker applications
│       └── benchmark/   # Performance benchmarks
├── apps/
│   └── pipeline/        # Observability pipeline implementation
│       ├── migrations/  # Database migrations
│       └── src/
│           ├── nodes/   # Pipeline node implementations
│           ├── examples/ # Example implementations
│           └── utils.ts # Utility functions
├── deno.json            # Deno configuration
└── README.md
```

## Usage

### Creating a Pipeline

```typescript
import { CoreSystem } from "@reflex/nexus-core/core";
import {
  createConnectorNode,
  createEnrichNode,
  createInterestFilterNode,
  createReactionNode,
  createProcessNode
} from "@reflex/pipeline";

const system = await CoreSystem.connect({
  connectionString: Deno.env.get("CORE_DATABASE_URL") ?? "postgres://...",
  namespace: "my-namespace"
});

// Register and start nodes
const connectorNode = await system.registerNode({
  nodeId: "connector-1",
  displayName: "Web Connector"
});

const enrichNode = await system.registerNode({
  nodeId: "enricher-1",
  displayName: "Content Enricher"
});

// Create pipeline components
const connector = createConnectorNode(connectorNode, system);
const enricher = createEnrichNode(enrichNode, system, "web");
const interestFilter = createInterestFilterNode(interestNode, system);
const reaction = createReactionNode(reactionNode, system);
const process = createProcessNode(processNode, system);

// Start nodes
await connectorNode.start();
await enrichNode.start();
// ... start other nodes

// Initialize pipeline
enricher.start();
interestFilter.start();
reaction.start();
process.start();
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
  '[
    {
      "type": "slack_notification",
      "message": "Content changed: {{payload.source}}"
    }
  ]'::jsonb,
  TRUE
);
```

## Database Schema

The pipeline extends the core event system with:

- `core.entity_state` - Entity state storage
- `core.interest_rules` - Matching rules
- `core.reaction_executions` - Action execution tracking
- `core.process_instances` - Workflow instances

See `apps/pipeline/migrations/001_observability_tables.sql` for schema details.

## Development

```bash
# Format code
deno task fmt

# Lint code
deno task lint

# Type check
deno task check

# Run server
deno task dev:server

# Run worker
deno task dev:worker

# Run pipeline example
deno task pipeline:example

# Run migrations
deno task migrate
```

### Running with Permissions

Deno requires explicit permissions. The tasks in `deno.json` include the necessary flags:
- `--allow-net` - Network access (PostgreSQL)
- `--allow-env` - Environment variables
- `--allow-read` - File system read access (migrations)

For production, you can create a standalone executable:
```bash
deno compile --allow-net --allow-env --allow-read nexus-core/src/apps/server.ts
```

## License

ISC


