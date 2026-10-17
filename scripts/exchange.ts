import '../packages/config.ts';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { z } from 'zod';
import { prepareExchangeFlow } from '../packages/exchanges/flow.ts';
import { openExchangeStore, recordConfirmation, commitExchange, ExchangeError, fixtureClock } from '../packages/exchanges/store.ts';
import { JevError, type Decision } from '../packages/jev/client.ts';

// Supplied developer interaction, with a simulated Alex session. This isn't a login.
async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: npm run exchange -- data/exchanges/<run>/manifest.json');
  const manifest = z.object({ storePath: z.string(), customerId: z.literal('customer-alex'),
    startingOrder: z.literal('order-1001'), replacementSku: z.literal('shoe-blue-9') }).parse(JSON.parse(readFileSync(file, 'utf8')));
  const path = realpathSync(manifest.storePath);
  const storeRoots = ['data/exchanges', 'data/chapter2'].map(directory => resolve(directory)).filter(existsSync);
  if (!storeRoots.some(directory => path.startsWith(realpathSync(directory) + sep))) throw new Error('Use an isolated exchange manifest.');
  const offline = process.argv.includes('--offline-fixture');
  if (!offline && !process.env.TYPESAFE_API_KEY?.trim()) throw new JevError('missing_key');
  const fixture: Decision = { model: 'OFFLINE TEST DOUBLE, NOT JEV OUTPUT', answers: { issue: {
    type: 'choice', choice: 'fit_preference', confidence: 0.95,
    probabilities: { fit_preference: 1, product_problem: 0, unclear: 0 },
  } }, usage: { input_tokens: 0, output_tokens: 0 } };
  const db = openExchangeStore(path);
  const ui = createInterface({ input: stdin, output: stdout });
  // Relative elapsed time gives the confirmation a real expiry while fixing the fixture date.
  const started = Date.now();
  const now = () => new Date(Date.parse(fixtureClock) + Date.now() - started).toISOString();
  try {
    console.log('Fictional store. Testing on Alex\'s behalf. Payment and shipping are simulated.');
    if (offline) console.log('OFFLINE FIXTURE: decision is forced to fit_preference for interaction testing. No Jev call is made.');
    const message = await ui.question('Describe Alex\'s issue: ');
    const prepared = await prepareExchangeFlow(db, manifest.customerId, {
      orderId: manifest.startingOrder, sku: 'shoe-blue-8', replacementSku: manifest.replacementSku, quantity: 1,
    }, message, offline ? async () => fixture : undefined, now());
    if (prepared.status !== 'awaiting_confirmation') {
      console.log(JSON.stringify(prepared, null, 2)); return;
    }
    console.log(JSON.stringify(prepared, null, 2));
    const answer = (await ui.question('Confirm this exact exchange for Alex? Type confirm or decline: ')).trim().toLowerCase();
    if (!['confirm', 'decline'].includes(answer)) { console.log('No decision recorded; nothing was exchanged.'); return; }
    recordConfirmation(db, manifest.customerId, prepared.requestId, prepared.fingerprint, answer === 'confirm', now());
    if (answer === 'decline') { console.log('Declined. Order and inventory unchanged.'); return; }
    console.log(JSON.stringify(commitExchange(db, manifest.customerId, prepared.requestId, prepared.fingerprint, now()), null, 2));
  } finally { ui.close(); db.close(); }
}
main().catch(error => {
  console.error(error instanceof JevError || error instanceof ExchangeError ? error.message : 'exchange interaction failed. Check the manifest and setup guide.');
  process.exitCode = 1;
});
