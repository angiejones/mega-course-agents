import { openStore, seed } from '../packages/store/index.ts';
const scenario = process.argv[2] || 'size-exchange';
if (scenario !== 'size-exchange') throw new Error('Available scenario: size-exchange');
const db = openStore();
try { seed(db); console.log('Reset size-exchange fixtures. Agent traces were preserved.'); } finally { db.close(); }
