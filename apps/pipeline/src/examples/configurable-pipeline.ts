/**
 * Configurable Pipeline Example
 * 
 * Demonstrates loading and executing a pipeline from JSON configuration
 */

import "../compat/node-timers.ts";
import { CoreSystem } from "@reflex/nexus-core/core";
import { PipelineDatabase, PipelineInitializer } from "../index.ts";
import { loadPipelineConfig, validatePipelineConfig } from "../config/pipeline-loader.ts";
import { ConfigurablePipelineExecutor } from "../executor/pipeline-executor.ts";

async function main() {
  // Load .env file if it exists
  try {
    const envFile = await Deno.readTextFile(".env");
    for (const line of envFile.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
          Deno.env.set(key.trim(), value);
        }
      }
    }
    console.log("✓ Loaded .env file");
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log("⚠ No .env file found, using environment variables");
    } else {
      console.warn("⚠ Failed to load .env file:", error);
    }
  }

  // Load environment variables
  const coreConnectionString = Deno.env.get("CORE_DATABASE_URL");
  const reflexConnectionString = Deno.env.get("REFLEX_DATABASE_URL") ?? coreConnectionString;
  const namespace = Deno.env.get("CORE_NAMESPACE") ?? "observability";
  const configPath = Deno.env.get("PIPELINE_CONFIG") ?? "./apps/pipeline/src/config/pipelines/connector-enrich-process.json";

  if (!coreConnectionString) {
    throw new Error("CORE_DATABASE_URL environment variable is required (set in .env file or environment)");
  }

  console.log("=".repeat(60));
  console.log("Configurable Pipeline Example");
  console.log("=".repeat(60));
  console.log(`Config path: ${configPath}`);
  console.log(`Namespace: ${namespace}`);

  // Load pipeline configuration
  console.log("\n[1] Loading pipeline configuration...");
  const config = await loadPipelineConfig(configPath);
  validatePipelineConfig(config);
  console.log(`✓ Loaded pipeline: ${config.name}`);
  console.log(`  Description: ${config.description ?? "N/A"}`);
  console.log(`  Nodes: ${config.nodes.length}`);
  config.nodes.forEach(node => {
    console.log(`    - ${node.id} (${node.type}): listens to [${node.listensTo.join(", ")}]`);
  });

  // Connect to core database
  console.log("\n[2] Connecting to core database...");
  const system = await CoreSystem.connect({
    connectionString: coreConnectionString,
    namespace: config.namespace,
    application: "configurable-pipeline"
  });
  console.log("✓ Core database connected");

  // Connect to pipeline database
  console.log("\n[3] Connecting to pipeline database...");
  const pipelineDb = await PipelineDatabase.connect(
    reflexConnectionString,
    system.getLogger()
  );
  console.log("✓ Pipeline database connected");

  // Initialize pipeline schema
  console.log("\n[4] Initializing pipeline schema...");
  const initializer = new PipelineInitializer(pipelineDb, system.getLogger());
  await initializer.initialize();
  console.log("✓ Pipeline schema initialized");

  // Create pipeline executor
  console.log("\n[5] Creating pipeline executor...");
  const executor = new ConfigurablePipelineExecutor(config, system, pipelineDb);
  console.log("✓ Pipeline executor created");

  // Start pipeline
  console.log("\n[6] Starting pipeline...");
  await executor.start();
  console.log("✓ Pipeline started");

  // Setup signal handlers for graceful shutdown
  const shutdown = async () => {
    console.log("\n\nShutting down pipeline...");
    await executor.stop();
    await system.close();
    await pipelineDb.close();
    console.log("✓ Shutdown complete");
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", shutdown);
  if (Deno.build.os !== "windows") {
    Deno.addSignalListener("SIGTERM", shutdown);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Pipeline running. Press Ctrl+C to stop.");
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error("Pipeline failed to start:", error);
  if (error instanceof Error) {
    console.error("[ERROR] Message:", error.message);
    console.error("[ERROR] Stack:", error.stack);
  }
  Deno.exit(1);
});

