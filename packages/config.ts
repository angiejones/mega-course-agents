import { config } from 'dotenv';
import { resolve, dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

export function findProjectRoot(start = process.cwd()): string {
  let directory = resolve(start);
  while (true) {
    try {
      if (
        JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
          .name === 'mega-course-agents'
      ) {
        return directory;
      }
    } catch {}
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(
        'Run this command inside the mega-course-agents checkout.',
      );
    }
    directory = parent;
  }
}

const root = findProjectRoot();
config({ path: resolve(root, '.env.local'), quiet: true });

export const settings = {
  smallModel: process.env.MODEL_SMALL || 'openai/gpt-6-luna',
  capableModel: process.env.MODEL_CAPABLE || 'openai/gpt-6-sol',
  storePath: resolve(root, process.env.STORE_DB_PATH || 'data/store.db'),
  agentPath: resolve(root, process.env.AGENT_DB_PATH || 'data/agent.db'),
  customerId: process.env.CUSTOMER_ID || 'customer-alex',
};
