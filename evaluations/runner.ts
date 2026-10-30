import readline from 'node:readline';
import type { GuardEvent } from '../packages/guardrails/index.ts';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const emit = (event: unknown) => process.stdout.write('COURSE_EVENT:' + JSON.stringify(event) + '\n');
const checkout = resolve(process.env.COURSE_CHECKOUT!);
const source = (path:string) => pathToFileURL(resolve(checkout,path)).href;
const { withGuardrailEvents } = await import(source('packages/guardrails/index.ts'));
const { withJevUsage } = await import(source('packages/jev/usage.ts'));
const { settings } = await import(source('packages/config.ts'));
const root = resolve(process.env.EPISODE_DIR!);
for (const path of [settings.storePath, settings.agentPath, settings.collaborationDirectory]) {
  if (!path.startsWith(root + '/') && path !== root) throw new Error('Runtime path escaped episode directory');
}
const { startOrderMcpFixture } = await import(source('scripts/support/order-mcp-fixture.ts'));
const closeMcp = await startOrderMcpFixture();
const { openExchangeStore, seedExchangeStore } = await import(source('packages/exchanges/store.ts'));
const db = openExchangeStore(settings.storePath);
seedExchangeStore(db);
const { mastra } = await import(source('apps/retail/src/mastra/index.ts'));
const agent = mastra.getAgent('retailAgent');
const memory = { thread: randomUUID(), resource: settings.customerId };
function snapshot() {
  return {
    exchanges: db.prepare('SELECT * FROM exchanges ORDER BY rowid').all(),
    requests: db.prepare('SELECT * FROM exchange_requests ORDER BY rowid').all(),
    reviews: db.prepare('SELECT * FROM quality_reviews ORDER BY rowid').all(),
    inventory: db.prepare('SELECT * FROM inventory ORDER BY sku').all(),
    preferences: db.prepare('SELECT * FROM customer_preferences').all(),
  };
}
const runtime = { checkout, store:settings.storePath, memory:settings.agentPath,
  collaboration:settings.collaborationDirectory, model:settings.smallModel,
  customer:settings.customerId, thread:memory.thread, node:process.version,
  tools:Object.keys(await agent.listTools()), defaults:await agent.getDefaultOptions() };
emit({type:'ready',runtime,snapshot:snapshot()});
const lines = readline.createInterface({input:process.stdin});
for await (const line of lines) {
  const jevCalls: import('../packages/jev/usage.ts').JevCall[] = [];
  try {
    const event = JSON.parse(line);
    if (event.type === 'close') break;
    if (event.type !== 'user') throw new Error('Unknown event');
    const start = performance.now();
    const guardrailEvents: GuardEvent[] = [];
    const result = await withJevUsage(jevCalls, () => withGuardrailEvents(guardrailEvents, () =>
      agent.generate(event.message, {memory, abortSignal:AbortSignal.timeout(180000)})));
    emit({type:'reply',text:result.text,usage:result.totalUsage,jevCalls,guardrailEvents,tripwire:result.tripwire,
      toolCalls:result.toolCalls,toolResults:result.toolResults,
      traceId:result.traceId,steps:result.steps.length,
      elapsedMs:Math.round(performance.now()-start),snapshot:snapshot()});
  } catch (error) {
    emit({type:'error',jevCalls,message:error instanceof Error ? error.message : String(error),snapshot:snapshot()});
  }
}
await mastra.observability.flush();
db.close();
await closeMcp();
emit({type:'closed'});
process.exit(0);
