import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { settings } from '../config.ts';
import { prepareExchangeFlow } from './flow.ts';
import { exchangeInput, openExchangeStore, recordConfirmation, commitExchange, getProposal, ExchangeError } from './store.ts';

const inputSchema = exchangeInput.extend({ message: z.string().min(1).max(8000) });
export const workflowResultSchema = z.object({
  status: z.enum(['awaiting_confirmation', 'clarify', 'human_review', 'rejected', 'declined', 'committed']),
  referral: z.object({ referralId: z.string(), department: z.literal('quality'), status: z.literal('pending') }).optional(),
  message: z.string(), requestId: z.string().optional(), fingerprint: z.string().optional(),
  proposal: z.record(z.string(), z.unknown()).optional(), receipt: z.record(z.string(), z.unknown()).optional(),
});
export const confirmationSchema = z.object({ decision: z.enum(['confirm', 'decline']).describe('Confirm or decline the exact exchange proposal shown.') });
const assess = createStep({
  id: 'assess-and-quote', inputSchema, outputSchema: workflowResultSchema,
  execute: async ({ inputData }) => {
    const db = openExchangeStore(settings.storePath);
    try {
      const result = await prepareExchangeFlow(db, settings.customerId, inputData, inputData.message);
      if (result.status === 'awaiting_confirmation') return { status: result.status, message: 'Review this proposal. Reply 1 to confirm or 2 to decline.', requestId: result.requestId, fingerprint: result.fingerprint, proposal: result.proposal };
      if (result.status === 'human_review') return { status: result.status, referral: result.referral,
        message: 'I’m sorry there’s a problem with your purchase. I’ve referred your exchange request to our quality team for review.' };
      return { status: result.status, message: result.status === 'rejected' ? result.reason : 'Ask the customer to describe the issue more specifically.' };
    } catch (error) {
      if (error instanceof ExchangeError) return { status: 'rejected' as const, message: error.code };
      throw error;
    } finally { db.close(); }
  },
});
const confirm = createStep({
  id: 'confirm-exchange', inputSchema: workflowResultSchema, outputSchema: workflowResultSchema,
  suspendSchema: workflowResultSchema, resumeSchema: confirmationSchema,
  execute: async ({ inputData, resumeData, suspend }) => {
    if (inputData.status !== 'awaiting_confirmation') return inputData;
    if (!resumeData) return await suspend(inputData);
    const db = openExchangeStore(settings.storePath);
    try {
      const id = inputData.requestId!, fingerprint = inputData.fingerprint!;
      const saved = getProposal(db, settings.customerId, id);
      if (resumeData.decision === 'decline') {
        if (saved.state === 'draft') recordConfirmation(db, settings.customerId, id, fingerprint, false);
        return { status: 'declined' as const, message: 'Exchange declined. Order and inventory unchanged.', requestId: id };
      }
      if (saved.state === 'draft') recordConfirmation(db, settings.customerId, id, fingerprint, true);
      const receipt = commitExchange(db, settings.customerId, id, fingerprint);
      return { status: 'committed' as const, message: 'The confirmed exchange was created.', requestId: id, receipt };
    } catch (error) {
      if (error instanceof ExchangeError) return { status: 'rejected' as const, message: error.code };
      throw error;
    } finally { db.close(); }
  },
});
export const exchangeWorkflow = createWorkflow({
  id: 'retail-exchange', description: 'Check eligibility, classify the issue with Jev, quote a replacement, and wait for customer confirmation before committing.',
  inputSchema, outputSchema: workflowResultSchema,
}).then(assess).then(confirm).commit();
