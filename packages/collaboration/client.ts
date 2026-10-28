import { randomUUID } from "node:crypto";
import { AgentCard, Task, TaskState } from "@a2a-js/sdk";
export type RemoteResult = {
  taskId: string;
  contextId: string;
  state: "input-required" | "completed" | "failed" | "working";
  question?: string;
  data?: unknown;
};
export class SpecialistClient {
  constructor(
    readonly origin: string,
    readonly token: string,
    readonly skill: string,
    readonly timeoutMs = 30000,
  ) {
    const u = new URL(origin);
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(u.hostname)
      )
    )
      throw new Error("HTTPS is required outside loopback.");
  }
  async request(path: string, body?: unknown) {
    const response = await fetch(new URL(path, this.origin), {
      method: body ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "A2A-Version": "1.0",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok)
      throw new Error(`Specialist unavailable (${response.status})`);
    const text = await response.text();
    if (text.length > 262144) throw new Error("Specialist response too large");
    return JSON.parse(text);
  }
  async discover() {
    const card = AgentCard.fromJSON(
      await this.request("/.well-known/agent-card.json"),
    );
    if (
      !card.skills.some((s) => s.id === this.skill) ||
      !card.supportedInterfaces.some(
        (i) =>
          i.url === new URL("/a2a", this.origin).href &&
          i.protocolVersion === "1.0" &&
          i.protocolBinding === "JSONRPC",
      )
    )
      throw new Error("Untrusted or incompatible agent card");
    return {
      name: card.name,
      skills: card.skills,
      capabilities: card.capabilities,
    };
  }
  async send(
    input: unknown,
    previous?: { taskId: string; contextId: string },
  ): Promise<RemoteResult> {
    await this.discover();
    const response = await this.request("/a2a", {
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "SendMessage",
      params: {
        message: {
          messageId: randomUUID(),
          role: "ROLE_USER",
          parts: [{ data: input }],
          ...(previous
            ? { taskId: previous.taskId, contextId: previous.contextId }
            : {}),
        },
      },
    });
    if (response.error)
      throw new Error(`A2A request failed (${response.error.code})`);
    const task = Task.fromJSON(response.result?.task ?? response.result);
    if (!task.id) throw new Error("Missing task reference");
    const state = task.status?.state;
    return {
      taskId: task.id,
      contextId: task.contextId,
      state:
        state === TaskState.TASK_STATE_COMPLETED
          ? "completed"
          : state === TaskState.TASK_STATE_INPUT_REQUIRED
            ? "input-required"
            : state === TaskState.TASK_STATE_WORKING ||
                state === TaskState.TASK_STATE_SUBMITTED
              ? "working"
              : "failed",
      question: task.status?.message?.parts
        .filter((p) => p.content?.$case === "text")
        .map((p) => p.content?.value)
        .join("\n"),
      data: task.artifacts
        .flatMap((a) => a.parts)
        .find((p) => p.content?.$case === "data")?.content?.value,
    };
  }
}
