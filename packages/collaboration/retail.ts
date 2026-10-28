import { resolve } from "node:path";
import { findProjectRoot, settings } from "../config.ts";
import { database, read } from "./storage.ts";
import type { Runner } from "./transport.ts";
export const resolutionPath = () =>
  resolve(
    findProjectRoot(),
    process.env.RESOLUTION_DB_PATH || resolve(settings.collaborationDirectory, "resolutions.db"),
  );
export function retailRunner(
  generate: (message: string, thread: string, owner: string) => Promise<string>,
): Runner {
  return async (input, _history, taskId, owner) => {
    if (owner !== settings.customerId)
      throw new Error("Customer binding mismatch");
    if (typeof input !== "string" || input.length > 8000)
      throw new Error("A customer message is required.");
    const thread = `shopping-${taskId}`;
    const reply = await generate(input, thread, owner);
    const db = database(resolutionPath());
    try {
      const state = read<{ phase: string }>(
        db,
        JSON.stringify(["resolution", owner, thread]),
        "active",
      );
      return state &&
        [
          "committed",
          "declined",
          "needs_review",
          "recovery_available",
        ].includes(state.phase)
        ? { state: "completed", data: { reply, phase: state.phase } }
        : { state: "input-required", question: reply };
    } finally {
      db.close();
    }
  };
}
