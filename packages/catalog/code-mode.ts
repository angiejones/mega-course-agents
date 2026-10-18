import { createCodeMode } from '@mastra/core/tools';
import type { ToolsInput } from '@mastra/core/agent';
import { QuickJsCodeModeTransport } from '@mastra/quickjs';
import { orderClient } from '../mcp/order-client.ts';

export function createShoppingCodeMode(discovered: ToolsInput) {
  const tools = Object.fromEntries(Object.entries(discovered)
    .filter(([name]) => ['orders_searchProducts', 'orders_getProductVariants'].includes(name)));
  if (Object.keys(tools).length !== 2) throw new Error('Shopping MCP tools were not discovered');
  return createCodeMode(
    { tools, timeout: 10000 },
    new QuickJsCodeModeTransport({ memoryLimitMb: 32 }),
  );
}
// Resolve after Studio starts. The discovered tools call the server through MCP.
let pending: Promise<ReturnType<typeof createShoppingCodeMode>> | undefined;
export function getShoppingCodeMode() {
  return pending ??= orderClient.listTools().then(createShoppingCodeMode).catch(error => { pending = undefined; throw error; });
}
