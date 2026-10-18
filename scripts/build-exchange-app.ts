import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const bundle = await build({ entryPoints: ['packages/mcp/exchange-app/view.ts'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', minify: true,
  define: { __BLUE_SHIRT_IMAGE__: JSON.stringify('data:image/png;base64,' + readFileSync('packages/mcp/exchange-app/assets/blue-shirt.png').toString('base64')) },
});
const html = readFileSync('packages/mcp/exchange-app/view.html', 'utf8').replace('<!-- APP_SCRIPT -->', () => `<script>${bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`);
mkdirSync('dist/exchange-app', { recursive: true });
writeFileSync('dist/exchange-app/index.html', html);
console.log('Built dist/exchange-app/index.html');
