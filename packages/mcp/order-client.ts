import { randomUUID } from 'node:crypto';
import { MCPClient } from '@mastra/mcp';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export function createOrderClient() {
  return new MCPClient({
    id: `retail-orders-${randomUUID()}`,
    servers: { orders: {
      url: new URL(process.env.ORDER_MCP_URL || 'http://localhost:4111/api/mcp/orders/mcp'),
      protocolVersion: '2026-07-28', timeout: 5000,
    } },
  });
}

export const orderClient = createOrderClient();

// Generic resource access for the MCP servers configured in this application.
export const listMcpResourcesTool = createTool({
  id: 'list-mcp-resources',
  description: 'Discover reference information available from the configured MCP servers. Use when a question needs organization-specific or product-specific information that is not in the conversation; general knowledge may not match these sources. Returns resources grouped by server, including names, URIs and content types. Choose a relevant resource and use readMcpResource to retrieve its contents before answering.',
  inputSchema: z.object({}).strict(),
  execute: async () => {
    const client = createOrderClient();
    try {
      return await client.resources.list();
    } finally { await client.disconnect(); }
  },
});

export const readMcpResourceTool = createTool({
  id: 'read-mcp-resource',
  description: 'Read a reference resource from a configured MCP server. Use the server name and resource URI returned by listMcpResources; do not invent them. Returns the resource contents.',
  inputSchema: z.object({ server: z.string().min(1), uri: z.string().min(1) }).strict(),
  execute: async ({ server, uri }) => {
    const client = createOrderClient();
    try {
      return await client.resources.read(server, uri);
    } finally { await client.disconnect(); }
  },
});
