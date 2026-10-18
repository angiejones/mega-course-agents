import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { exchangeInput } from '../exchanges/store.ts';
import { exchangeWorkflow, workflowResultSchema, confirmationSchema } from '../exchanges/workflow.ts';

const continuationSchema = z.object({ runId: z.string(), message: z.string() });
const proposalSchema = exchangeInput.extend({
  currency: z.string(), creditCents: z.number(), replacementCents: z.number(),
  feeCents: z.number(), differenceCents: z.number(),
});

export const exchangeViaMcpTool = createTool({
  id: 'exchange-with-elicitation',
  description: 'Request an exchange for the configured customer. First use getOrder and getInventory to identify the purchased and replacement SKUs. Pass the customer\'s explanation in message. Runs the existing exchange workflow, checks eligibility and prepares a quote, then asks the customer to confirm or decline that exact proposal through an MCP form. Only an explicit confirm answer can create an exchange. A successful elicitation result identifies the customer\'s submitted answer; do not ask them to confirm again in chat.',
  inputSchema: exchangeInput.extend({ message: z.string().min(1).max(8000) }),
  suspendSchema: continuationSchema,
  resumeSchema: confirmationSchema,
  outputSchema: workflowResultSchema.extend({
    source: z.literal('user_elicitation').optional(),
    elicitationAction: z.literal('accept').optional(),
    customerDecision: z.enum(['confirm', 'decline']).optional(),
  }),
  execute: async (input, context) => {
    if (context?.resumeData) {
      // Mastra restores this payload from its signed MCP continuation state.
      const { runId } = continuationSchema.parse(context.suspendPayload);
      const answer = confirmationSchema.parse(context.resumeData);
      const run = await exchangeWorkflow.createRun({ runId });
      const result = await run.resume({ step: 'confirm-exchange', resumeData: answer });
      if (result.status !== 'success') throw new Error('Exchange workflow could not resume.');
      const outcome = workflowResultSchema.parse(result.result);
      return {
        ...outcome,
        source: 'user_elicitation' as const,
        elicitationAction: 'accept' as const,
        customerDecision: answer.decision,
        message: `The customer submitted ${answer.decision} through the exchange confirmation form. ${outcome.message}` +
          (outcome.status === 'committed' ? ' The store is awaiting the return of the original item.' : ''),
      };
    }
    if (!context?.suspend) throw new Error('This tool requires an MCP client that supports elicitation.');
    const run = await exchangeWorkflow.createRun();
    const result = await run.start({ inputData: input });
    if (result.status === 'success') return workflowResultSchema.parse(result.result);
    if (result.status !== 'suspended') throw new Error('Exchange workflow failed.');
    const pending = workflowResultSchema.parse(result.steps['confirm-exchange']?.suspendPayload);
    const quote = proposalSchema.parse(pending.proposal);
    const money = (cents: number) => `${quote.currency} ${(cents / 100).toFixed(2)}`;
    const message = [
      `Review exchange for order ${quote.orderId}.`,
      `Original item: ${quote.sku}. Replacement: ${quote.replacementSku}. Quantity: ${quote.quantity}.`,
      `Credit: ${money(quote.creditCents)}. Replacement total: ${money(quote.replacementCents)}. Fee: ${money(quote.feeCents)}.`,
      `Amount due: ${money(quote.differenceCents)}.`,
      'Choose confirm to approve this exact exchange, or decline to leave your order unchanged.',
    ].join('\n');
    return await context.suspend({ runId: run.runId, message });
  },
});
