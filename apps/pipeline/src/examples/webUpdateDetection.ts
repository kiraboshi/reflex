/**
 * Example: Website Update Detection End-to-End Flow
 * 
 * Demonstrates the complete pipeline:
 * 1. Connector Node emits signal.web.snapshot
 * 2. Enricher Node computes diff → emits enriched.web.content_delta
 * 3. Interest Node matches rule → emits interest.match
 * 4. Reaction Node sends notification → emits reaction.executed
 * 5. Process Node creates incident → emits process.started
 */

// Import Node.js timers compatibility shim before nexus-core
import "../compat/node-timers.ts";

import { CoreSystem } from "@reflex/nexus-core/core";
import {
  createConnectorNode,
  createPeriodicConnectorNode,
  createEnrichNode,
  createInterestFilterNode,
  createReactionNode,
  createProcessNode
} from "../index.ts";
import { PipelineInitializer } from "../initializer.ts";
import { PipelineDatabase } from "../database.ts";

function requireEnv(key: string): string {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Load environment variables from .env file
 */
async function loadEnvFile(envPath: string = ".env"): Promise<void> {
  console.log(`[DEBUG] Attempting to load .env file from: ${envPath}`);
  
  try {
    // Try to read the .env file
    const envContent = await Deno.readTextFile(envPath);
    console.log(`[DEBUG] ✓ .env file found and read successfully`);
    console.log(`[DEBUG] .env file size: ${envContent.length} bytes`);
    
    // Parse the .env file
    const lines = envContent.split("\n");
    let loadedCount = 0;
    const loadedVars: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      
      // Parse KEY=VALUE format
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        // Only set if not already set in environment
        if (!Deno.env.get(key)) {
          Deno.env.set(key, value);
          loadedCount++;
          loadedVars.push(key);
          // Mask password in debug output
          const maskedValue = key.includes("PASSWORD") || key.includes("SECRET") 
            ? "****" 
            : (key.includes("URL") && value.includes("@") 
              ? value.replace(/:([^:@]+)@/, ":****@") 
              : value);
          console.log(`[DEBUG]   Loaded: ${key}=${maskedValue}`);
        } else {
          console.log(`[DEBUG]   Skipped: ${key} (already set in environment)`);
        }
      }
    }
    
    console.log(`[DEBUG] ✓ Loaded ${loadedCount} environment variable(s) from .env file`);
    if (loadedVars.length > 0) {
      console.log(`[DEBUG]   Variables loaded: ${loadedVars.join(", ")}`);
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log(`[DEBUG] ✗ .env file not found at ${envPath}`);
      console.log(`[DEBUG]   Trying alternative locations...`);
      
      // Try alternative locations
      const alternatives = ["./.env", "./nexus-core/.env", "../.env"];
      for (const altPath of alternatives) {
        try {
          const altContent = await Deno.readTextFile(altPath);
          console.log(`[DEBUG] ✓ Found .env file at: ${altPath}`);
          console.log(`[DEBUG] .env file size: ${altContent.length} bytes`);
          
          // Parse and load from alternative location
          const lines = altContent.split("\n");
          let loadedCount = 0;
          const loadedVars: string[] = [];
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) {
              continue;
            }
            
            const match = trimmed.match(/^([^=]+)=(.*)$/);
            if (match) {
              const key = match[1].trim();
              let value = match[2].trim();
              
              if ((value.startsWith('"') && value.endsWith('"')) || 
                  (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
              }
              
              if (!Deno.env.get(key)) {
                Deno.env.set(key, value);
                loadedCount++;
                loadedVars.push(key);
                const maskedValue = key.includes("PASSWORD") || key.includes("SECRET") 
                  ? "****" 
                  : (key.includes("URL") && value.includes("@") 
                    ? value.replace(/:([^:@]+)@/, ":****@") 
                    : value);
                console.log(`[DEBUG]   Loaded: ${key}=${maskedValue}`);
              } else {
                console.log(`[DEBUG]   Skipped: ${key} (already set in environment)`);
              }
            }
          }
          
          console.log(`[DEBUG] ✓ Loaded ${loadedCount} environment variable(s) from ${altPath}`);
          if (loadedVars.length > 0) {
            console.log(`[DEBUG]   Variables loaded: ${loadedVars.join(", ")}`);
          }
          return;
        } catch {
          // Continue to next alternative
        }
      }
      console.log(`[DEBUG] ✗ No .env file found in any location`);
    } else {
      console.error(`[DEBUG] ✗ Error reading .env file:`, error);
    }
  }
}

async function main() {
  // Load .env file first
  console.log("[DEBUG] ========================================");
  console.log("[DEBUG] Environment Variable Loading");
  console.log("[DEBUG] ========================================");
  await loadEnvFile();
  
  // Check environment variables before and after
  console.log(`[DEBUG] ========================================`);
  console.log(`[DEBUG] Environment Variable Status`);
  console.log(`[DEBUG] ========================================`);
  console.log(`[DEBUG] CORE_DATABASE_URL: ${Deno.env.get("CORE_DATABASE_URL") ? "SET" : "NOT SET"}`);
  console.log(`[DEBUG] REFLEX_DATABASE_URL: ${Deno.env.get("REFLEX_DATABASE_URL") ? "SET" : "NOT SET"}`);
  console.log(`[DEBUG] CORE_NAMESPACE: ${Deno.env.get("CORE_NAMESPACE") ? "SET" : "NOT SET"}`);
  
  const coreConnectionString = requireEnv("CORE_DATABASE_URL");
  const reflexConnectionString = requireEnv("REFLEX_DATABASE_URL");
  const namespace = Deno.env.get("CORE_NAMESPACE") ?? "observability";

  // Debug logging for connection strings (mask password)
  const maskedCoreUrl = coreConnectionString.replace(/:([^:@]+)@/, ":****@");
  const maskedReflexUrl = reflexConnectionString.replace(/:([^:@]+)@/, ":****@");
  console.log(`[DEBUG] ========================================`);
  console.log(`[DEBUG] Configuration`);
  console.log(`[DEBUG] ========================================`);
  console.log("Initializing observability pipeline...");
  console.log(`[DEBUG] Core Database URL: ${maskedCoreUrl}`);
  console.log(`[DEBUG] Reflex Database URL: ${maskedReflexUrl}`);
  console.log(`[DEBUG] Namespace: ${namespace}`);
  console.log(`[DEBUG] Using CORE_DATABASE_URL: FROM ENV`);
  console.log(`[DEBUG] Using REFLEX_DATABASE_URL: FROM ENV`);

  // Initialize core system (nexus-core database)
  console.log("[DEBUG] Attempting to connect to core database...");
  const system = await CoreSystem.connect({
    connectionString: coreConnectionString,
    namespace,
    application: "observability-pipeline"
  });
  console.log("[DEBUG] Core database connection successful");

  // Initialize reflex database (separate connection)
  console.log("[DEBUG] Attempting to connect to reflex database...");
  const reflexDb = await PipelineDatabase.connect(
    reflexConnectionString,
    system.getLogger()
  );
  console.log("[DEBUG] Reflex database connection successful");

  // Initialize reflex-specific schema
  console.log("[DEBUG] Initializing reflex schema...");
  const pipelineInitializer = new PipelineInitializer(reflexDb, system.getLogger());
  await pipelineInitializer.initialize();
  console.log("[DEBUG] Reflex schema initialized");

  // Register nodes for each pipeline stage
  const connectorNode = await system.registerNode({
    nodeId: "connector-web-1",
    displayName: "Web Connector",
    description: "Collects web snapshots",
    metadata: { role: "connector", type: "web" }
  });

  const enrichNode = await system.registerNode({
    nodeId: "enricher-web-1",
    displayName: "Web Content Enricher",
    description: "Enriches web snapshots with content deltas",
    metadata: { role: "enricher", type: "web" }
  });

  const interestNode = await system.registerNode({
    nodeId: "interest-filter-1",
    displayName: "Interest Filter",
    description: "Evaluates enrichment events against interest rules",
    metadata: { role: "interest-filter" }
  });

  const reactionNode = await system.registerNode({
    nodeId: "reaction-1",
    displayName: "Reaction Handler",
    description: "Executes actions based on interest matches",
    metadata: { role: "reaction" }
  });

  const processNode = await system.registerNode({
    nodeId: "process-1",
    displayName: "Process Manager",
    description: "Manages workflows and incidents",
    metadata: { role: "process" }
  });

  // Create pipeline nodes (pass reflex database connection)
  const enricher = createEnrichNode(enrichNode, system, reflexDb, "web");
  const interestFilter = createInterestFilterNode(interestNode, system, reflexDb);
  const reaction = createReactionNode(reactionNode, system, reflexDb);
  const processMgr = createProcessNode(processNode, system, reflexDb);
  
  // Create simple periodic connector (emits every 10 seconds)
  const periodicConnector = createPeriodicConnectorNode(connectorNode, system, 10);

  // Initialize pipeline components (registers event handlers)
  if (enricher) {
    enricher.start();
  }
  interestFilter.start();
  reaction.start();
  processMgr.start();

  // Start all nodes (begins consuming events)
  console.log("\nStarting nodes and registering event handlers...");
  console.log(`Queue: ${system.getQueueName()}`);
  
  await connectorNode.start();
  console.log(`  ✓ Connector node started (nodeId: ${connectorNode.nodeId})`);
  
  await enrichNode.start();
  console.log(`  ✓ Enricher node started (nodeId: ${enrichNode.nodeId})`);
  
  await interestNode.start();
  console.log(`  ✓ Interest filter node started (nodeId: ${interestNode.nodeId})`);
  
  await reactionNode.start();
  console.log(`  ✓ Reaction node started (nodeId: ${reactionNode.nodeId})`);
  
  await processNode.start();
  console.log(`  ✓ Process node started (nodeId: ${processNode.nodeId})`);

  console.log("✓ All pipeline nodes started and consuming from queue");

  // Setup example interest rule for periodic heartbeats (uses reflex database)
  await setupExampleInterestRule(reflexDb, namespace);

  // Start periodic connector (will emit every 10 seconds)
  console.log("\nStarting periodic connector (emits every 10 seconds)...");
  periodicConnector.start();
  console.log("✓ Periodic connector started. Events will flow through the pipeline automatically.");

  // Keep running
  const shutdown = async () => {
    console.log("\nShutting down...");
    periodicConnector.stop();
    await connectorNode.stop();
    await enrichNode.stop();
    await interestNode.stop();
    await reactionNode.stop();
    await processNode.stop();
    await reflexDb.close();
    await system.close();
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", shutdown);
  // SIGTERM is not supported on Windows, only register if on Unix-like systems
  if (Deno.build.os !== "windows") {
    Deno.addSignalListener("SIGTERM", shutdown);
  }

  console.log("\nPipeline running. Press Ctrl+C to stop.");
}

async function setupExampleInterestRule(
  reflexDb: PipelineDatabase,
  namespace: string
): Promise<void> {
  // Insert example interest rule for periodic heartbeats (simpler for testing)
  await reflexDb.query(
    `INSERT INTO core.interest_rules 
     (namespace, rule_id, name, event_type, condition_expr, actions, enabled)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE)
     ON CONFLICT (namespace, rule_id) DO UPDATE
     SET condition_expr=EXCLUDED.condition_expr,
         actions=EXCLUDED.actions,
         updated_at=now()`,
    [
      namespace,
      "periodic-heartbeat-alert",
      "Periodic Heartbeat Alert",
      "enriched.periodic.heartbeat",
      "payload.value === true",
      JSON.stringify([
        {
          type: "slack_notification",
          message: "Periodic heartbeat received: count {{payload.count}}"
        }
      ])
    ]
  );

  console.log("✓ Example interest rule configured for periodic heartbeats");
}

main().catch((error) => {
  console.error("Pipeline failed to start:", error);
  if (error instanceof Error) {
    console.error("[DEBUG] Error message:", error.message);
    console.error("[DEBUG] Error stack:", error.stack);
  }
  Deno.exit(1);
});

