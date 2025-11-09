# ADR-002: Connector Scheduling via pg_cron

**Status**: Accepted  
**Date**: 2025-01-XX  
**Deciders**: Development Team  

## Context

The observability pipeline requires connectors to be invoked on schedules (specific times or recurring intervals). Connectors collect data from external systems and emit signal events that flow through the pipeline. We needed to decide how to implement scheduled connector invocations.

### Current State

- **Periodic connectors** used `setInterval` in application code (`PeriodicConnectorNode`)
- The system already has `pg_cron` integration via `core.scheduled_tasks` table and `core.run_scheduled_task()` function
- Scheduled tasks emit events that flow through the normal queue mechanism (`pgmq`)
- Connectors are configured via JSON pipeline definitions
- Architecture uses PostgreSQL-native event bus with `pgmq` for queuing
- Single router per process pattern: `CoreSystem` has one `consumeLoop()` that routes by `eventType`

## Decision

We will use **pg_cron via `core.scheduled_tasks`** for connector scheduling, with each connector specifying its own event type for direct routing.

### Implementation Pattern

1. **Scheduled Task Creation**: During pipeline initialization, create a scheduled task via `CoreSystem.createScheduledTask()` that emits a connector-specific trigger event
2. **Event-Driven Routing**: Each connector registers a handler for its specific trigger event type
3. **Direct Routing**: The centralized router routes by `eventType` directly to the correct handler

```json
{
  "id": "periodic-connector-1",
  "type": "connector",
  "config": {
    "subtype": "scheduled",
    "scheduledTask": {
      "name": "periodic-heartbeat-connector",
      "cronExpression": "*/1 * * * *",
      "triggerEventType": "connector.trigger.periodic-connector-1",
      "signalEventType": "signal.periodic.heartbeat"
    }
  }
}
```

## Rationale

### Why pg_cron over Application-Level Scheduling

**Reliability & Persistence**
- Database-backed scheduling ensures execution even during application downtime
- No missed executions: database guarantees schedules execute
- High availability: works regardless of application instance state
- PostgreSQL's `pg_cron` is highly reliable

**Centralized Management**
- Single source of truth: all schedules visible in `core.scheduled_tasks` table
- Database queries: can query, update, disable schedules via SQL
- Unified interface: same mechanism for all scheduled tasks
- Audit trail: execution history automatically logged in `core.event_log`

**Operational Benefits**
- No application dependency: schedules execute even if connector process is down (events queue)
- Easier monitoring: can monitor scheduled task health via database queries
- Simpler deployment: don't need to ensure connector processes are running for schedules
- Built-in observability: `core.scheduled_tasks.updated_at` tracks last execution

**Scalability**
- No coordination needed: database handles scheduling, no risk of duplicate executions
- Load distribution: events queue naturally distributes work across connector instances
- Resource efficiency: no per-connector timers consuming application memory

**Consistency**
- Unified pattern: uses same scheduling infrastructure as other scheduled tasks
- Event-driven: fits naturally into existing event-driven architecture
- Standard tooling: leverages existing `CoreSystem.createScheduledTask()` API

### Why Connector-Specific Event Types

**Fits Centralized Router Pattern**
- Router routes by `eventType` (one router per process)
- Each connector specifies its own event type
- Router routes directly to the correct handler without payload inspection
- No filtering overhead: direct routing is more efficient

**Flexibility**
- Each connector can choose its own event type naming convention
- Allows for connector-specific routing logic if needed
- Defaults to `connector.trigger.{connectorId}` if not specified

**Simplicity**
- No need for payload-based filtering
- Clear separation: event type identifies the target connector
- Easier to debug: event type clearly shows which connector should handle it

## Consequences

### Positive

- **Reliability**: Database-backed scheduling ensures execution even during downtime
- **Observability**: Centralized scheduling management and audit trail
- **Scalability**: Natural load distribution via event queue
- **Consistency**: Uses same infrastructure as other scheduled tasks
- **Direct Routing**: Efficient routing without payload inspection

### Negative

- **Database Dependency**: Requires PostgreSQL with `pg_cron` extension installed
- **Complexity**: More moving parts (scheduled tasks, event routing)
- **Development Friction**: Need database with `pg_cron` for local development
- **Event Type Proliferation**: Each connector creates its own event type (acceptable tradeoff)

### Tradeoffs Considered

**Alternative: Generic Event Type with Payload Filtering**
- Would use single `connector.trigger` event type
- Connectors would filter by `payload.connectorId`
- **Rejected**: Less efficient (all handlers receive all events), doesn't leverage router's direct routing capability

**Alternative: Application-Level Scheduling**
- Use `setInterval` or cron parsing in application code
- **Rejected**: Requires running process, no persistence, scaling challenges, limited observability

## Implementation Details

### Scheduled Task Creation

```typescript
const task = await system.createScheduledTask({
  name: scheduledTaskConfig.name,
  cronExpression: scheduledTaskConfig.cronExpression,
  eventType: triggerEventType, // Connector-specific
  payload: {
    connectorId,
    ...scheduledTaskConfig.signalPayload
  },
  timezone: scheduledTaskConfig.timezone
});
```

### Connector Handler Registration

```typescript
// Connector registers handler for its specific event type
this.node.onEvent(this.triggerEventType, async (event, context) => {
  await this.handleTrigger(event, context);
});
```

### Routing Flow

```
pg_cron Scheduled Task
  ↓ Emits: connector.trigger.{connectorId}
CoreSystem Router (one per process)
  ↓ Routes by eventType
Connector Handler (direct route, no filtering)
  ↓ Executes connector logic
Signal Event Emission
```

## References

- Current implementation: `apps/pipeline/src/nodes/connectorNode.ts`
- Scheduled tasks infrastructure: `nexus-core/src/core/system.ts`
- `core.run_scheduled_task()` function: `nexus-core/src/core/initializer.ts`
- Database event system spec: `nexus-core/DATABASE_EVENT_SYSTEM_SPEC.md`
- Pipeline executor: `apps/pipeline/src/executor/pipeline-executor.ts`

