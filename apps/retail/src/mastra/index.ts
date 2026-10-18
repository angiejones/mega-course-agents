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
import { exchangeWorkflow } from '../../../../packages/exchanges/workflow.ts';
import { orderServer } from '../../../../packages/mcp/order-server.ts';

mkdirSync(dirname(settings.agentPath), { recursive: true });

export const mastra = new Mastra({
  agents: { retailAgent },
  workflows: { exchangeWorkflow },
  mcpServers: { orderServer },
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
