import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  preferenceCategory,
  preferenceInput,
  readPreference,
  savePreference,
} from '../../../../packages/store/preferences.ts';
import { settings } from '../../../../packages/config.ts';
import { openStore } from '../../../../packages/store/index.ts';

function withStore<T>(fn: (db: ReturnType<typeof openStore>) => T): T {
  const db = openStore();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export const readPreferenceTool = createTool({
  id: 'read-preference',
  description:
    'Read a saved shopping preference for the current customer. ' +
    'Use when the customer asks about a remembered preference. ' +
    'A preference does not identify an order or authorize an exchange.',
  inputSchema: z.object({ category: preferenceCategory }),
  execute: async ({ category }) =>
    withStore(db => readPreference(db, settings.customerId, category)),
});

export const savePreferenceTool = createTool({
  id: 'save-preference',
  description:
    'Save a shopping preference for the current customer when they ' +
    'explicitly ask to remember it. Merely stating a preference is ' +
    'not a request to save it. Do not infer a preference from ' +
    'an order or save details of an exchange request. ' +
    'Use the category and value supplied by the customer.',
  inputSchema: preferenceInput,
  execute: async input =>
    withStore(db => savePreference(db, settings.customerId, input)),
});
