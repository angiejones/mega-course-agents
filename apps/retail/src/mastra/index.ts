import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import {
  Observability,
  MastraStorageExporter,
  SensitiveDataFilter,
} from '@mastra/observability';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { settings } from '../../../../packages/config.ts';
import { retailAgent } from './agent.ts';

export { getOrderTool } from './tools.ts';

mkdirSync(dirname(settings.agentPath), { recursive: true });

export const mastra = new Mastra({
  agents: { retailAgent },
  storage: new LibSQLStore({
    id: 'retail-agent-storage',
    url: `file:${settings.agentPath}`,
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mega-retail',
        exporters: [new MastraStorageExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
