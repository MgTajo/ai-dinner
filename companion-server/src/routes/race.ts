import type { Express } from "express";
import { handleHealth, handleTask, implementedTaskTypes } from "../race/adapter.js";
import { TASK_TYPES } from "../race/protocol.js";

export default function register(app: Express) {
  // GET /agent-studio/v1/health: the race verifier checks this before every attempt.
  app.get("/agent-studio/v1/health", (req, res) => {
    const { status, body } = handleHealth(req.headers.authorization);
    res.status(status).json(body);
  });

  // POST /agent-studio/v1/tasks: the race verifier sends tasks here. Your logic is in src/race/handlers.ts.
  app.post("/agent-studio/v1/tasks", async (req, res) => {
    const { status, body } = await handleTask(req.headers.authorization, req.body);
    res.status(status).json(body);
  });

  // GET /race: what the verifier will find (no secrets).
  app.get("/race", (_req, res) => {
    const built = implementedTaskTypes();
    res.json({
      verifierToken: process.env.AGENT_STUDIO_VERIFIER_TOKEN ? "set" : "missing: copy it from your team page into AGENT_STUDIO_VERIFIER_TOKEN",
      taskTypes: Object.fromEntries(TASK_TYPES.map((t) => [t, built.includes(t) ? "handler written" : "not built yet"])),
    });
  });
}
