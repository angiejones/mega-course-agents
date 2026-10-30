import { customerDecision } from './confirmation.ts';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { settings } from '../config.ts';
import { exchangeInput, openExchangeStore } from './store.ts';
import { exchangeWorkflow, workflowResultSchema } from './workflow.ts';
function session() {
  const db = openExchangeStore(settings.storePath);
  db.exec('CREATE TABLE IF NOT EXISTS exchange_chat_runs (thread_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, proposal TEXT NOT NULL)');
  const columns = db.prepare('PRAGMA table_info(exchange_chat_runs)').all();
  if (!columns.some(column => column.name === 'source_input')) {
    db.exec('ALTER TABLE exchange_chat_runs ADD COLUMN source_input TEXT');
  }
  return db;
}
export const exchangeTool = createTool({
  id: 'exchange-with-confirmation',
  description: 'Prepare an exchange proposal. Does not commit it. Present the returned proposal and ask the customer to reply 1 to confirm or 2 to decline.',
  inputSchema: exchangeInput.extend({ message: z.string().min(1).max(8000) }),
  outputSchema: workflowResultSchema,
  execute: async (input, context) => {
    const thread = context?.agent?.threadId;
    if (!thread) throw new Error('A conversation thread is required.');
    const db = session();
    try {
      const sourceInput = JSON.stringify(input);
      const pending = db.prepare(
        'SELECT run_id, proposal, source_input FROM exchange_chat_runs '
        + 'WHERE thread_id = ?',
      ).get(thread);
      if (pending) {
        if (pending.source_input === sourceInput) {
          return workflowResultSchema.parse(JSON.parse(String(pending.proposal)));
        }
        const previous = await exchangeWorkflow.createRun({
          runId: String(pending.run_id),
        });
        const cancelled = await previous.resume({
          step: 'confirm-exchange',
          resumeData: { decision: 'decline' },
        });
        if (cancelled.status !== 'success'
            || cancelled.result.status !== 'declined') {
          throw new Error('The previous proposal could not be invalidated.');
        }
        db.prepare(
          'DELETE FROM exchange_chat_runs WHERE thread_id = ?',
        ).run(thread);
      }
      const run = await exchangeWorkflow.createRun();
      const result = await run.start({ inputData: input });
      if (result.status === 'suspended') {
        const proposal = workflowResultSchema.parse(result.steps['confirm-exchange']?.suspendPayload);
        db.prepare(
          'INSERT INTO exchange_chat_runs '
          + '(thread_id, run_id, proposal, source_input) VALUES (?, ?, ?, ?)',
        ).run(thread, run.runId, JSON.stringify(proposal), sourceInput);
        return proposal;
      }
      if (result.status !== 'success') throw new Error('Exchange workflow failed.');
      return workflowResultSchema.parse(result.result);
    } finally { db.close(); }
  },
});
export const confirmExchangeTool = createTool({
  id: 'confirm-exchange',
  description: 'Resume the pending exchange workflow after the customer replies 1 to confirm or 2 to decline. Reads the decision from the actual latest user message, not tool arguments.',
  inputSchema: z.object({}), outputSchema: workflowResultSchema,
  execute: async (_input, context) => {
    const agent = context?.agent;
    if (!agent?.threadId) throw new Error('A conversation thread is required.');
    const decision = customerDecision(agent.getMessages?.() ?? [], agent.messages ?? []);
    if (decision !== 'confirm' && decision !== 'decline') return { status: 'awaiting_confirmation' as const, message: 'Please reply 1 to confirm or 2 to decline after reviewing the proposal.' };
    const db = session();
    try {
      const pending = db.prepare('SELECT run_id FROM exchange_chat_runs WHERE thread_id = ?').get(agent.threadId);
      if (!pending) return { status: 'rejected' as const, message: 'There is no pending exchange in this conversation.' };
      const run = await exchangeWorkflow.createRun({ runId: String(pending.run_id) });
      const result = await run.resume({ step: 'confirm-exchange', resumeData: { decision } });
      if (result.status !== 'success') throw new Error('Exchange workflow could not resume.');
      db.prepare('DELETE FROM exchange_chat_runs WHERE thread_id = ?').run(agent.threadId);
      return workflowResultSchema.parse(result.result);
    } finally { db.close(); }
  },
});
