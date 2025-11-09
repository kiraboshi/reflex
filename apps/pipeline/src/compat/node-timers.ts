/**
 * Node.js Timers Compatibility Shim for Deno
 * 
 * Patches global setInterval and setTimeout to return Node.js-compatible
 * timer objects with unref() and ref() methods.
 * 
 * This allows nexus-core (which remains npm-based) to work in Deno without
 * requiring changes to its internals.
 * 
 * Uses Deno's node:timers compatibility layer as documented at:
 * https://docs.deno.com/api/node/timers/
 * 
 * The node:timers module provides Timeout objects (from setTimeout/setInterval)
 * that implement the Timeout interface with unref(), ref(), hasRef(), refresh(),
 * and close() methods.
 */

// Import Node.js-compatible timers from Deno's compatibility layer
// Note: node:timers provides the standard callback-based timers (not promises)
// that return timer objects with unref() and ref() methods
import {
  setInterval as nodeSetInterval,
  setTimeout as nodeSetTimeout,
  clearInterval as nodeClearInterval,
  clearTimeout as nodeClearTimeout
} from "node:timers";

// Patch global setInterval to return Node.js-compatible timer
const originalSetInterval = globalThis.setInterval;
globalThis.setInterval = function(
  callback: () => void,
  delay?: number,
  ...args: unknown[]
): ReturnType<typeof nodeSetInterval> {
  return nodeSetInterval(callback, delay, ...args);
};

// Patch global setTimeout to return Node.js-compatible timer  
const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = function(
  callback: () => void,
  delay?: number,
  ...args: unknown[]
): ReturnType<typeof nodeSetTimeout> {
  return nodeSetTimeout(callback, delay, ...args);
};

// Patch clearInterval to work with both Deno and Node.js timers
const originalClearInterval = globalThis.clearInterval;
globalThis.clearInterval = function(
  id: ReturnType<typeof nodeSetInterval> | ReturnType<typeof originalSetInterval> | undefined
): void {
  if (id && typeof id === "object" && "unref" in id) {
    // Node.js timer object - use node:timers clearInterval
    nodeClearInterval(id as ReturnType<typeof nodeSetInterval>);
    return;
  }
  originalClearInterval(id as number);
};

// Patch clearTimeout to work with both Deno and Node.js timers
const originalClearTimeout = globalThis.clearTimeout;
globalThis.clearTimeout = function(
  id: ReturnType<typeof nodeSetTimeout> | ReturnType<typeof originalSetTimeout> | undefined
): void {
  if (id && typeof id === "object" && "unref" in id) {
    // Node.js timer object - use node:timers clearTimeout
    nodeClearTimeout(id as ReturnType<typeof nodeSetTimeout>);
    return;
  }
  originalClearTimeout(id as number);
};

