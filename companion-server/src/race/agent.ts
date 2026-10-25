// The tool-using agent behind use_tools and run_workflow: the model decides which tools to call,
// this file calls them (with retries for transient failures and a hard timeout), feeds the
// results back, and stops when the model has an answer or a limit is reached. Works with Gemini
// or with the local model (see src/lib/ai/model.ts).
import type { Content, FunctionCall } from "@google/genai";
import { generate } from "../lib/ai/gemini.js";
import { evaluate, formatNumber } from "../lib/ai/math.js";
import { askModelJson, ollamaToolStep, provider, type ChatMessage, type ToolCall, type ToolDecl } from "../lib/ai/model.js";
import { TaskError, type Task, type ToolSpec } from "./protocol.js";
import { callTool, ToolCallError } from "./tools.js";

const RETRY_DELAYS_MS = [250, 600, 1200];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls a tool, retrying 5xx answers and dropped connections with a short backoff. A tool that
 * doesn't answer within limits.timeoutMs is a timeout (504); one that keeps failing is
 * unavailable (503). 4xx answers are returned to the model as an error result, not retried.
 */
export async function callToolReliably(tool: ToolSpec, task: Task, input: Record<string, unknown>, deadline: number): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const perCall = task.limits?.timeoutMs ?? 10_000;
  let lastError = "";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 50) throw new TaskError("upstream_timeout", `${tool.name} did not answer in time`);
    try {
      return { ok: true, result: await callTool(tool, task, input, Math.min(perCall, remaining)) };
    } catch (err) {
      if (!(err instanceof ToolCallError)) throw err;
      lastError = err.message;
      if (/did not answer within/.test(err.message)) throw new TaskError("upstream_timeout", err.message);
      const transient = err.httpStatus === null || err.httpStatus >= 500 || err.httpStatus === 429;
      if (!transient) return { ok: false, error: err.message };
      if (attempt < RETRY_DELAYS_MS.length) await sleep(Math.min(RETRY_DELAYS_MS[attempt], Math.max(0, deadline - Date.now() - 50)));
    }
  }
  throw new TaskError("upstream_unavailable", `${tool.name} kept failing: ${lastError}`);
}

export interface AgentRun {
  text: string;
  /** Successful calls only: what output.toolResults reports. */
  toolResults: { tool: string; result: unknown }[];
  /** Every call, in order, including ones the tool rejected. */
  calls: { tool: string; input: Record<string, unknown>; result?: unknown; error?: string }[];
}

export interface AgentOptions {
  system: string;
  prompt: string;
  /**
   * Called before every tool call. Return a reason to refuse the call (the model is told why and
   * can change course), or throw a TaskError to stop the task.
   */
  guard?: (tool: ToolSpec, input: Record<string, unknown>, run: AgentRun) => string | undefined;
}

/** A local tool for exact arithmetic. Not a task tool, so it is never reported in toolResults. */
const CALCULATOR: ToolDecl = {
  name: "calculator",
  description: "Evaluates an arithmetic expression exactly (+ - * / ^ % and parentheses). Use it for any sum, difference, product or average.",
  parameters: { type: "object", properties: { expression: { type: "string", description: "e.g. (12.5 + 7.25) * 3" } }, required: ["expression"] },
};

export async function runToolAgent(task: Task, options: AgentOptions): Promise<AgentRun> {
  const p = await provider();
  if (!p) throw new TaskError("internal", "No AI model is available on the companion server.");
  const tools = task.tools ?? [];
  const maxCalls = task.limits?.maxToolCalls ?? 12;
  // The whole task has to finish in the layer's time limit; tool timeouts are enforced per call.
  const deadline = Date.now() + Math.max(15_000, (task.limits?.timeoutMs ?? 10_000) * 6);
  const decls: ToolDecl[] = [...tools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema ?? { type: "object", properties: {} } })), CALCULATOR];
  const run: AgentRun = { text: "", toolResults: [], calls: [] };

  /** Runs one call the model asked for and returns what to tell the model. */
  const execute = async (call: ToolCall): Promise<Record<string, unknown>> => {
    if (call.name === CALCULATOR.name) {
      try {
        return { result: formatNumber(evaluate(String(call.args.expression ?? ""))) };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }
    const tool = tools.find((t) => t.name === call.name);
    if (!tool) return { error: `No tool named ${call.name}` };
    if (run.calls.length >= maxCalls) throw new TaskError("limit_exceeded", `Needs more than ${maxCalls} tool calls`);
    const refused = options.guard?.(tool, call.args, run);
    if (refused) return { error: refused };
    const outcome = await callToolReliably(tool, task, call.args, deadline);
    run.calls.push({ tool: tool.name, input: call.args, ...(outcome.ok ? { result: outcome.result } : { error: outcome.error }) });
    if (!outcome.ok) return { error: outcome.error };
    run.toolResults.push({ tool: tool.name, result: outcome.result });
    return { result: outcome.result };
  };

  const maxTurns = maxCalls + 4;
  if (p === "ollama") {
    const messages: ChatMessage[] = [
      { role: "system", content: options.system },
      { role: "user", content: options.prompt },
    ];
    for (let turn = 0; turn < maxTurns; turn++) {
      const step = await ollamaToolStep(messages, decls);
      if (!step.calls.length) {
        run.text = step.text;
        return run;
      }
      messages.push(step.assistant);
      for (const call of step.calls) {
        messages.push({ role: "tool", tool_name: call.name, content: JSON.stringify(await execute(call)) });
      }
    }
    throw new TaskError("limit_exceeded", "The agent did not finish within its turn limit");
  }

  const transcript: Content[] = [{ role: "user", parts: [{ text: options.prompt }] }];
  const functionDeclarations = decls.map((d) => ({ name: d.name, description: d.description, parametersJsonSchema: d.parameters }));
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await generate({
      contents: transcript,
      config: { systemInstruction: options.system, tools: [{ functionDeclarations }], temperature: 0 },
    });
    const calls: FunctionCall[] = response.functionCalls ?? [];
    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) transcript.push(modelContent);
    if (!calls.length) {
      run.text = response.text ?? "";
      return run;
    }
    const parts = [];
    for (const call of calls) {
      const reply = await execute({ name: call.name ?? "", args: (call.args ?? {}) as Record<string, unknown> });
      parts.push({ functionResponse: { id: call.id, name: call.name ?? "unknown", response: reply } });
    }
    transcript.push({ role: "user", parts });
  }
  throw new TaskError("limit_exceeded", "The agent did not finish within its turn limit");
}

/** Turns a finished run into data matching `schema`, using only what the tools returned. */
export async function structuredFromRun(task: Task, run: AgentRun, schema: Record<string, unknown>): Promise<unknown> {
  const prompt = [
    `Task: ${typeof task.input === "string" ? task.input : JSON.stringify(task.input)}`,
    `Tool calls and their results, in order:\n${JSON.stringify(run.calls, null, 1)}`,
    run.text ? `Agent's answer: ${run.text}` : "",
    "Fill in the JSON using only values from the tool results. Copy ids and numbers exactly.",
  ].join("\n\n");
  return askModelJson(prompt, schema, "You convert an agent's tool results into exact structured data.");
}
