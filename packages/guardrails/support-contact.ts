import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { privateStaffEmails } from './contact-policy.ts';

export const supportContactTool = createTool({
  id: 'get-support-contact',
  description: 'Look up the store support contact for help with a jacket or exchange.',
  inputSchema: z.object({}),
  outputSchema: z.object({ name: z.string(), email: z.string() }),
  execute: async () => ({ name: 'Jordan', email: privateStaffEmails[0] }),
});
