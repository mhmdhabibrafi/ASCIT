/**
 * ASCIT AI Queue Worker Script
 * Standalone background worker to process AiAnalysisJob queue
 * Run with: npx ts-node scripts/ai-worker.ts or npm run worker:ai
 */

import { processNextJobBatch, releaseStuckJobs } from "../src/lib/ai/worker";

const POLL_INTERVAL_MS = Number(process.env.AI_WORKER_POLL_MS || 3000);
const CONCURRENCY = Number(process.env.AI_WORKER_CONCURRENCY || 1);

let isRunning = true;

async function warmOllamaModel() {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://ollama:11434/api").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "qwen3:1.7b";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: "", stream: false, keep_alive: "30m" })
    });
    if (response.ok) console.log(`[AI Worker] Model ${model} warmed and kept alive.`);
    else console.warn(`[AI Worker] Model warm-up returned HTTP ${response.status}; continuing.`);
  } catch (error) {
    console.warn(`[AI Worker] Model warm-up skipped: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function runWorkerLoop() {
  console.log(`[AI Worker] ASCIT AI Queue Worker started.`);
  console.log(`[AI Worker] Concurrency: ${CONCURRENCY}, Poll Interval: ${POLL_INTERVAL_MS}ms`);

  await warmOllamaModel();

  // Initial release of stuck jobs
  const released = await releaseStuckJobs();
  if (released > 0) {
    console.log(`[AI Worker] Released ${released} stuck jobs on startup.`);
  }

  while (isRunning) {
    try {
      const processed = await processNextJobBatch(CONCURRENCY);
      if (processed > 0) {
        console.log(`[AI Worker] Processed ${processed} job(s).`);
      } else {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      console.error("[AI Worker] Error in worker loop:", error);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  console.log(`[AI Worker] Worker stopped gracefully.`);
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("[AI Worker] SIGINT received, stopping worker...");
  isRunning = false;
});

process.on("SIGTERM", () => {
  console.log("[AI Worker] SIGTERM received, stopping worker...");
  isRunning = false;
});

void runWorkerLoop();
