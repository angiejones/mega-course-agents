import { randomUUID } from 'node:crypto';
import { settings } from '../packages/config.ts';
import { mastra } from '../apps/retail/src/mastra/index.ts';
try {
  const result = await mastra.getAgent('retailAgent').generate(process.argv.slice(2).join(' ') || 'Can I exchange the shoes in order-1001 for a larger size?', { memory: { resource: settings.customerId, thread: randomUUID() } });
  console.log(result.text);
  console.log(JSON.stringify({ usage: result.totalUsage, traceId: result.traceId }));
} catch { console.error('Agent request failed. Check your key, billing, and model access.'); process.exitCode = 1; }
finally { await mastra.observability.flush(); }
