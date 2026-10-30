import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, MastraStorageExporter } from '@mastra/observability';

// This viewer opens a copy containing recorded traces, never a course runtime DB.
export const mastra = new Mastra({
  storage: new LibSQLStore({id:'course-trace-viewer',url:`file:${process.env.VIEWER_DB_PATH}`}),
  observability:new Observability({configs:{default:{serviceName:'mega-retail',exporters:[new MastraStorageExporter()]}}}),
  server:{host:'127.0.0.1',port:4178},
});
