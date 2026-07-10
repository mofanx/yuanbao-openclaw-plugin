/**
 * Smoke test: ensure createPipeline can be imported and builds the pipeline.
 *
 * This loads the real pipeline factory, which validates that all middleware
 * modules (including the custom command dispatcher) can be resolved.
 */

import assert from "node:assert/strict";
import test from "node:test";

void test("createPipeline builds the message pipeline", async () => {
  const { createPipeline } = await import("./create.js");
  const pipeline = createPipeline();
  assert.ok(pipeline);
});
