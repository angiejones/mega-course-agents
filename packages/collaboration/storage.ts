import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Task, ListTasksResponse, type ListTasksRequest } from "@a2a-js/sdk";
import type { TaskStore, ServerCallContext } from "@a2a-js/sdk/server";
export function database(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS records (scope TEXT, id TEXT, payload TEXT NOT NULL, PRIMARY KEY(scope,id))",
  );
  return db;
}
export function read<T>(
  db: DatabaseSync,
  scope: string,
  id: string,
): T | undefined {
  const row = db
    .prepare("SELECT payload FROM records WHERE scope=? AND id=?")
    .get(scope, id);
  return row ? (JSON.parse(String(row.payload)) as T) : undefined;
}
export function write(
  db: DatabaseSync,
  scope: string,
  id: string,
  value: unknown,
) {
  db.prepare(
    "INSERT INTO records VALUES (?,?,?) ON CONFLICT(scope,id) DO UPDATE SET payload=excluded.payload",
  ).run(scope, id, JSON.stringify(value));
}
export class DurableTaskStore implements TaskStore {
  constructor(readonly db: DatabaseSync) {}
  scope(c: ServerCallContext) {
    if (!c.user?.isAuthenticated) throw new Error("Authentication required");
    return JSON.stringify(["task", c.tenant ?? "", c.user.userName]);
  }
  async save(task: Task, c: ServerCallContext) {
    write(this.db, this.scope(c), task.id, Task.toJSON(task));
  }
  async load(id: string, c: ServerCallContext) {
    const raw = read(this.db, this.scope(c), id);
    return raw ? Task.fromJSON(raw) : undefined;
  }
  async list(params: ListTasksRequest, c: ServerCallContext) {
    const tasks = this.db
      .prepare("SELECT payload FROM records WHERE scope=? ORDER BY id")
      .all(this.scope(c))
      .map((r) => Task.fromJSON(JSON.parse(String(r.payload))))
      .filter(
        (t) =>
          (!params.contextId || t.contextId === params.contextId) &&
          (!params.status || t.status?.state === params.status),
      );
    const offset = Number(params.pageToken || 0);
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new Error("Invalid page token");
    const size = Math.min(Math.max(params.pageSize || 50, 1), 100);
    return ListTasksResponse.fromJSON({
      tasks: tasks.slice(offset, offset + size).map(Task.toJSON),
      pageSize: size,
      totalSize: tasks.length,
      nextPageToken: offset + size < tasks.length ? String(offset + size) : "",
    });
  }
}
