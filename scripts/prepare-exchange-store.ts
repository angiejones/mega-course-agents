import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openExchangeStore, seedExchangeStore, fixtureClock } from '../packages/exchanges/store.ts';
const directory = resolve('data/exchanges', randomUUID());
mkdirSync(directory, { recursive: true });
const storePath = resolve(directory, 'store.db');
const db = openExchangeStore(storePath);
try { seedExchangeStore(db); } finally { db.close(); }
const manifest = { storePath, agentPath: resolve(directory, 'agent.db'), fixtureClock,
  customerId: 'customer-alex', startingOrder: 'order-1001', replacementSku: 'shoe-blue-9' };
writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
console.log('Created a new isolated exchange store. Existing stores were preserved.');

if (process.argv.includes('--studio')) {
  console.log('Starting Studio with the new exchange store.');
  const studio = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    env: { ...process.env, STORE_DB_PATH: manifest.storePath, AGENT_DB_PATH: manifest.agentPath },
  });
  process.on('SIGINT', () => studio.kill('SIGINT'));
  process.on('SIGTERM', () => studio.kill('SIGTERM'));
  studio.on('error', error => {
    console.error(`Unable to start Studio: ${error.message}`);
    process.exitCode = 1;
  });
  studio.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
  });
}
