import { settings } from '../packages/config.ts';
import { openStore, getOrder } from '../packages/store/index.ts';
console.log('OpenAI key:', process.env.OPENAI_API_KEY ? 'configured (hidden)' : 'missing');
const db = openStore();
const ready = getOrder(db, settings.customerId, 'order-1001').found;
db.close();
console.log('Owned fixture order:', ready ? 'ready' : 'missing; run npm run seed');
try { const response = await fetch('http://localhost:4111/api/agents', { signal: AbortSignal.timeout(2000) }); console.log('Mastra Studio:', response.ok ? 'running' : `HTTP ${response.status}`); }
catch { console.log('Mastra Studio: stopped; run npm run dev in a separate terminal'); }
if (!ready || !process.env.OPENAI_API_KEY) process.exitCode = 1;
