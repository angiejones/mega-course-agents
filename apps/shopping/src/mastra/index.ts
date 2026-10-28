import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, MastraStorageExporter, SensitiveDataFilter } from '@mastra/observability';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { findProjectRoot, settings } from '../../../../packages/config.ts';
import { shoppingAgent } from '../../../../agents/shopping/src/agent.ts';
const path = resolve(findProjectRoot(), process.env.SHOPPING_AGENT_DB_PATH || resolve(settings.collaborationDirectory, 'shopping-agent.db'));
mkdirSync(dirname(path), {recursive: true});
export const mastra = new Mastra({
  agents: {shoppingAgent},
  server: {port: 4116},
  storage: new LibSQLStore({id: 'shopping-agent-storage', url: `file:${path}`}),
  observability: new Observability({configs: {default: {
    serviceName: 'personal-shopping', exporters: [new MastraStorageExporter()],
    spanOutputProcessors: [new SensitiveDataFilter()],
  }}}),
});
