import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { findProjectRoot } from '../config.ts';

export const variantSchema = z.object({
  sku: z.string(), productId: z.string(), name: z.string(),
  category: z.enum(['rain-jacket', 'backpack']), size: z.string(),
  priceCents: z.number().int().nonnegative(), currency: z.literal('USD'),
  stock: z.number().int().nonnegative(),
});
export type TripVariant = z.infer<typeof variantSchema>;
const productSchema = z.object({ id: z.string(), name: z.string(),
  category: z.enum(['rain-jacket', 'backpack']), variants: z.array(variantSchema) });
export function readTripProducts() {
  return z.array(productSchema).parse(JSON.parse(readFileSync(
    resolve(findProjectRoot(), process.env.SHOPPING_CATALOG_PATH || 'fixtures/catalog/trip-products.json'), 'utf8')));
}

export const searchProductsTool = createTool({
  id: 'searchProducts',
  description: 'Find shopping products by category. Returns product IDs and names. Use getProductVariants for sizes, current stock and prices. Shopping does not reserve stock or create an exchange.',
  inputSchema: z.object({ category: z.enum(['rain-jacket', 'backpack']) }).strict(),
  outputSchema: z.object({ products: z.array(productSchema.omit({ variants: true })) }),
  execute: async ({ category }) => ({ products: readTripProducts()
    .filter(p => p.category === category).map(({ variants, ...product }) => product) }),
});
export const getProductVariantsTool = createTool({
  id: 'getProductVariants',
  description: 'Read shopping variants for product IDs returned by searchProducts. Use productIds for multiple products in one call; productId also accepts a single product. Each variant includes size, stock, currency and price in integer cents. Zero stock means unavailable. This is shopping inventory, not exchange inventory.',
  inputSchema: z.object({ productId: z.string().min(1).optional(), productIds: z.array(z.string().min(1)).min(1).optional() }).strict(),
  outputSchema: z.object({ variants: z.array(variantSchema) }),
  execute: async (input) => {
    if (!!input.productId === !!input.productIds) throw new Error('Supply either productId or productIds');
    const ids = input.productIds ?? [input.productId!];
    const products = new Map(readTripProducts().map(p => [p.id, p]));
    // Process requested IDs in batches without exposing batching to callers.
    const variants: TripVariant[] = [];
    for (let offset = 0; offset < ids.length; offset += 50) {
      const batch = ids.slice(offset, offset + 50);
      variants.push(...batch.flatMap(id => {
        const product = products.get(id);
        if (!product) throw new Error('Unknown shopping product');
        return product.variants;
      }));
    }
    return { variants };
  },
});
