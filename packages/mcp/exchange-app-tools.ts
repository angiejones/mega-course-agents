import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { settings } from '../config.ts';
import { exchangeInput, getProposal, openExchangeStore } from '../exchanges/store.ts';
import { exchangeWorkflow, workflowResultSchema, confirmationSchema } from '../exchanges/workflow.ts';

export const exchangeAppUri = 'ui://retail/exchange.html';
// A shared deployment must supply the same secret to every server instance.
const key = process.env.EXCHANGE_APP_SECRET || randomBytes(32).toString('hex');
const ticketSchema = z.object({ runId: z.string(), requestId: z.string(), fingerprint: z.string(), customerId: z.string(), expires: z.number() });
function sign(payload: string) { return createHmac('sha256', key).update(payload).digest('base64url'); }
function ticket(value: z.infer<typeof ticketSchema>) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function verify(value: string) {
  const [payload, signature, extra] = value.split('.');
  const expected = Buffer.from(sign(payload || ''));
  const actual = Buffer.from(signature || '');
  if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid exchange confirmation.');
  const saved = ticketSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
  if (saved.customerId !== settings.customerId || saved.expires <= Date.now()) throw new Error('This confirmation has expired or belongs to another customer. Request a new proposal.');
  return saved;
}
const appResultSchema = workflowResultSchema.extend({ confirmationToken: z.string().optional(), items: z.array(z.record(z.string(), z.unknown())).optional() });
export const previewExchangeTool = createTool({
  id: 'preview-exchange',
  description: 'Prepare an exchange for the configured customer and display the store exchange card for their review. First use getOrder and getInventory for verified SKUs. Pass the customer explanation in message. The customer confirms or declines using the card buttons. Preparing this card does not create an exchange. If the client cannot display the card, use exchangeWithConfirmation for an elicitation form instead.',
  inputSchema: exchangeInput.extend({ message: z.string().min(1).max(8000) }),
  outputSchema: appResultSchema,
  mcp: { _meta: { ui: {
    resourceUri: exchangeAppUri,
    visibility: ['model', 'app']
  } } },
  execute: async input => {
    const run = await exchangeWorkflow.createRun();
    const result = await run.start({ inputData: input });
    if (result.status === 'success') return workflowResultSchema.parse(result.result);
    if (result.status !== 'suspended') throw new Error('Unable to prepare this exchange.');
    const pending = workflowResultSchema.parse(result.steps['confirm-exchange']?.suspendPayload);
    const db = openExchangeStore(settings.storePath);
    try {
      const saved = getProposal(db, settings.customerId, pending.requestId!);
      const items = [input.sku, input.replacementSku].map(sku => {
        const row = db.prepare('SELECT payload FROM variants WHERE sku=?').get(sku);
        if (!row) throw new Error('Product not found.');
        return JSON.parse(String(row.payload)) as Record<string, unknown>;
      });
      return { ...pending, message: 'Review the store exchange card. No exchange has been created. Use Confirm exchange or Decline in the card.', items,
        confirmationToken: ticket({ runId: run.runId, requestId: pending.requestId!, fingerprint: saved.fingerprint, customerId: settings.customerId, expires: Date.now() + 15 * 60_000 }) };
    } finally { db.close(); }
  },
});
// Serialize clicks for a run in this local server. The store also enforces atomic, idempotent commitment.
const active = new Set<string>();
export const decideExchangeTool = createTool({
  id: 'decide-exchange',
  description: 'Submit the customer decision from the store exchange card for its saved proposal.',
  inputSchema: confirmationSchema.extend({ confirmationToken: z.string().max(4096) }),
  outputSchema: workflowResultSchema,
  mcp: { _meta: { ui: { visibility: ['app'] } } },
  execute: async ({ confirmationToken, decision }) => {
    const saved = verify(confirmationToken);
    if (active.has(saved.runId)) throw new Error('This exchange decision is already being processed.');
    active.add(saved.runId);
    try {
      const db = openExchangeStore(settings.storePath);
      try {
        const proposal = getProposal(db, settings.customerId, saved.requestId);
        if (proposal.fingerprint !== saved.fingerprint) throw new Error('The exchange proposal has changed.');
      } finally { db.close(); }
      const prior = await exchangeWorkflow.getWorkflowRunById(saved.runId);
      if (prior?.status === 'success') return workflowResultSchema.parse(prior.result);
      const run = await exchangeWorkflow.createRun({ runId: saved.runId });
      const result = await run.resume({ step: 'confirm-exchange', resumeData: { decision } });
      if (result.status !== 'success') throw new Error('Unable to complete this decision.');
      const outcome = workflowResultSchema.parse(result.result);
      return { ...outcome, message: `The customer selected ${decision} in the store exchange card. ${outcome.message}` + (outcome.status === 'committed' ? ' The store is awaiting the return of the original item.' : '') };
    } finally { active.delete(saved.runId); }
  },
});
