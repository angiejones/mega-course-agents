import { createServer } from "node:http";
import { timingSafeEqual, randomUUID } from "node:crypto";
import {
  AgentCard,
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
} from "@a2a-js/sdk";
import {
  AgentEvent,
  DefaultRequestHandler,
  JsonRpcTransportHandler,
  ServerCallContext,
  type AgentExecutor,
} from "@a2a-js/sdk/server";
import { database, DurableTaskStore } from "./storage.ts";
import type { ServiceResult } from "./contracts.ts";
export type Runner = (
  input: unknown,
  history: unknown[],
  taskId: string,
  owner: string,
) => Promise<ServiceResult>;
export function createAgentService(options: {
  name: string;
  description: string;
  skill: string;
  skillDescription: string;
  catalogEntries?: Array<{ identifier: string; type: string; description: string; url: string; extensions?: Record<string, unknown> }>;
  url: string;
  token: string;
  owner: string;
  path: string;
  run: Runner;
}) {
  if (options.token.length < 24)
    throw new Error("Service token must contain at least 24 characters.");
  const db = database(options.path);
  const card = AgentCard.fromJSON({
    name: options.name,
    description: options.description,
    version: "1.0.0",
    supportedInterfaces: [
      { url: options.url, protocolBinding: "JSONRPC", protocolVersion: "1.0" },
    ],
    capabilities: { streaming: true, pushNotifications: false },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    securitySchemes: {
      bearer: { httpAuthSecurityScheme: { scheme: "bearer" } },
    },
    securityRequirements: [{ schemes: { bearer: [] } }],
    skills: [
      {
        id: options.skill,
        name: options.name,
        description: options.skillDescription,
        tags: [options.skill],
      },
    ],
  });
  const executor: AgentExecutor = {
    async execute(ctx, bus) {
      // The SDK may already have appended this message to the task history.
      const history = [...(ctx.task?.history ?? []).filter(m => m.messageId !== ctx.userMessage.messageId), ctx.userMessage];
      const task = Task.fromJSON({
        id: ctx.taskId,
        contextId: ctx.contextId,
        status: { state: "TASK_STATE_WORKING" },
      });
      task.history = history;
      bus.publish(AgentEvent.task(task));
      try {
        const unpack = (m: typeof ctx.userMessage) =>
          m.parts.map((p) => p.content?.value).filter((x) => x !== undefined);
        const input = unpack(ctx.userMessage)[0];
        const result = await options.run(
          input,
          history.slice(0, -1)
            .filter(m => m.role === ctx.userMessage.role)
            .map((m) => unpack(m)[0]),
          ctx.taskId,
          ctx.context.user!.userName,
        );
        if (result.state === "completed")
          bus.publish(
            AgentEvent.artifactUpdate(
              TaskArtifactUpdateEvent.fromJSON({
                taskId: ctx.taskId,
                contextId: ctx.contextId,
                artifact: {
                  artifactId: randomUUID(),
                  name: "result",
                  parts: [{ data: result.data }],
                },
                lastChunk: true,
              }),
            ),
          );
        bus.publish(
          AgentEvent.statusUpdate(
            TaskStatusUpdateEvent.fromJSON({
              taskId: ctx.taskId,
              contextId: ctx.contextId,
              status: {
                state:
                  result.state === "completed"
                    ? "TASK_STATE_COMPLETED"
                    : "TASK_STATE_INPUT_REQUIRED",
                message:
                  result.state === "input-required"
                    ? {
                        messageId: randomUUID(),
                        role: "ROLE_AGENT",
                        parts: [{ text: result.question }],
                      }
                    : undefined,
              },
              final: true,
            }),
          ),
        );
      } catch (error) {
        console.error("Specialist task failed", {
          taskId: ctx.taskId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        bus.publish(
          AgentEvent.statusUpdate(
            TaskStatusUpdateEvent.fromJSON({
              taskId: ctx.taskId,
              contextId: ctx.contextId,
              status: {
                state: "TASK_STATE_FAILED",
                message: {
                  messageId: randomUUID(),
                  role: "ROLE_AGENT",
                  parts: [
                    {
                      text: "The specialist could not complete this request. The task reference has been retained.",
                    },
                  ],
                },
              },
              final: true,
            }),
          ),
        );
      } finally {
        bus.finished();
      }
    },
    async cancelTask() {
      throw new Error("Cancellation is not supported by this service.");
    },
  };
  const handler = new JsonRpcTransportHandler(
    new DefaultRequestHandler(card, new DurableTaskStore(db), executor),
  );
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/.well-known/ai-catalog.json") {
      const cardUrl = new URL("/.well-known/agent-card.json", card.supportedInterfaces[0].url).href;
      res
        .writeHead(200, { "Content-Type": "application/ai-catalog+json" })
        .end(JSON.stringify({
          specVersion: "1.0",
          entries: [...(options.catalogEntries ?? []), {
            identifier: cardUrl,
            type: "application/a2a-agent-card+json",
            description: card.description,
            url: cardUrl,
          }],
        }, null, 2));
      return;
    }
    if (req.method === "GET" && req.url === "/.well-known/agent-card.json") {
      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify(AgentCard.toJSON(card), null, 2));
      return;
    }

    const actual = Buffer.from(req.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${options.token}`);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      res.writeHead(401, { "WWW-Authenticate": "Bearer" }).end();
      return;
    }
    if (req.method !== "POST" || req.url !== "/a2a") {
      res.writeHead(404).end();
      return;
    }
    if (req.headers["a2a-version"] !== "1.0") {
      res.writeHead(400).end("A2A-Version: 1.0 required");
      return;
    }
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536) {
          res.writeHead(413).end();
          return;
        }
      }
      const context = new ServerCallContext({
        requestedVersion: "1.0",
        user: { isAuthenticated: true, userName: options.owner },
      });
      const result = await handler.handle(body, context);
      if (Symbol.asyncIterator in result) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        });
        for await (const event of result) {
          if (res.destroyed) break;
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        res.end();
      } else
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify(result));
    } catch {
      if (!res.headersSent) res.writeHead(400);
      res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return {
    server,
    db,
    card,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      db.close();
    },
  };
}
