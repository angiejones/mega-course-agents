import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// A bounded rehearsal fixture, not a persistent development server.
// Import only after the rehearsal has selected its isolated database paths.
export async function startOrderMcpFixture() {
  const { orderServer } = await import('../../packages/mcp/order-server.ts');
  const server = createServer((req, res) => {
    void orderServer.startHTTP({
      url: new URL(req.url || '/mcp', 'http://127.0.0.1'), httpPath: '/mcp', req, res,
    }).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const previous = process.env.ORDER_MCP_URL;
  process.env.ORDER_MCP_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  return async () => {
    const { orderClient } = await import('../../packages/mcp/order-client.ts');
    await orderClient.disconnect();
    if (previous === undefined) delete process.env.ORDER_MCP_URL;
    else process.env.ORDER_MCP_URL = previous;
    await orderServer.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  };
}
