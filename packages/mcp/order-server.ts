import { getShipmentsTool, getTrackingTool, getSupportCasesTool } from '../fulfillment/tools.ts';
import { searchProductsTool, getProductVariantsTool } from '../catalog/trip-tools.ts';
import { resolve } from 'node:path';
import { findProjectRoot } from '../config.ts';
import { previewExchangeTool, decideExchangeTool, exchangeAppUri } from './exchange-app-tools.ts';
import { MCPServer } from '@mastra/mcp';
import { exchangeViaMcpTool } from './exchange-tool.ts';
import { inventoryTool } from '../exchanges/inventory-tool.ts';
import { getOrderTool } from '../orders/tool.ts';
import { openExchangeStore, policy } from '../exchanges/store.ts';
import { settings } from '../config.ts';

export const retailResources = [
  { uri: 'retail://policies/returns', name: 'Return and exchange policy', mimeType: 'text/plain' },
  { uri: 'retail://guides/jacket-sizes', name: 'Jacket size guide', mimeType: 'text/plain' },
];

const appsEnabled = process.env.RETAIL_MCP_APPS === 'true';

export const orderServer = new MCPServer({
  id: 'orders', name: 'Retail orders', version: '1.0.0',
  tools: { getShipments: getShipmentsTool, getTracking: getTrackingTool, getSupportCases: getSupportCasesTool, searchProducts: searchProductsTool, getProductVariants: getProductVariantsTool, getOrder: getOrderTool, getInventory: inventoryTool, exchangeWithConfirmation: exchangeViaMcpTool,
    ...(appsEnabled ? { previewExchange: previewExchangeTool, decideExchange: decideExchangeTool } : {}),
  },
  appResources: appsEnabled ? { [exchangeAppUri]: { 
    name: 'Store exchange', 
    htmlPath: resolve(findProjectRoot(), 'dist/exchange-app/index.html'), 
    meta: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } 
  } } : {},
  resources: {
    listResources: async () => retailResources,
    getResourceContent: async ({ uri }) => {
      if (uri === 'retail://policies/returns') {
        const db = openExchangeStore(settings.storePath);
        try {
          const rules = policy(db);
          return { text: `store policy ${rules.id}: Exchanges are allowed within ${rules.windowDays} calendar days after delivery, including day ${rules.windowDays}. Final-sale items are excluded. Credit uses the amount actually paid. The exchange fee is ${rules.feeCents} USD cents. Quotes expire after ${rules.quoteMinutes} minutes. The service verifies ownership, purchased quantity, remaining exchangeable quantity and current stock. Product problems are referred to quality review. An explicit confirmation of the current proposal is required before commitment. This service implements exchanges, not cash refunds. A policy explanation does not establish eligibility or authorize an exchange.` };
        } finally { db.close(); }
      }
      if (uri === 'retail://guides/jacket-sizes') {
        return { text: [
          'Jacket size guide — regular fit',
          'Choose a size using your body chest circumference, not the measurement of a jacket laid flat.',
          'Measure around the fullest part of your chest with your arms relaxed, keeping the tape level and comfortably snug. Round to the nearest whole centimetre.',
          'Size | Chest circumference (cm)',
          'S | 86–93',
          'M | 94–101',
          'L | 102–109',
          'XL | 110–117',
          'XXL | 118–125',
          'For example, a 100 cm chest falls in size M.',
          'These ranges describe body measurements; regular-fit jackets include room for movement. Choose the larger size if you prefer a looser fit or plan to wear thick layers.',
          'Use a product-specific fit guide when one is supplied on the product page.',
        ].join('\n') };
      }
      throw new Error('Unknown retail resource');
    },
  },
});
