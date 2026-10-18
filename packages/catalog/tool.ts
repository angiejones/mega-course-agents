import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { findProjectRoot } from '../config.ts';

const variantSchema = z.object({
  sku: z.string(), productId: z.string(), name: z.string(),
  category: z.literal('jackets'), size: z.string(), color: z.string(),
  priceCents: z.number().int().nonnegative(), currency: z.literal('USD'),
  stock: z.number().int().nonnegative(),
}).strict();

export function readCatalog() {
  return z.array(variantSchema).parse(JSON.parse(readFileSync(
    resolve(findProjectRoot(), 'fixtures/catalog/variants.json'), 'utf8',
  )));
}

export const catalogTool = createTool({
  id: 'getCatalog',
  description: 'Read all shopping catalog variants. Filter by size, positive stock and budget in code. This catalog is separate from exchange inventory.',
  inputSchema: z.object({}).strict(),
  outputSchema: z.array(variantSchema),
  execute: async () => readCatalog(),
});
