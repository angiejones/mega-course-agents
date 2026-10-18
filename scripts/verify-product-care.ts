import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve('data/product-care', randomUUID());
mkdirSync(directory, { recursive: true });
process.env.STORE_DB_PATH = resolve(directory, 'store.db');
process.env.AGENT_DB_PATH = resolve(directory, 'agent.db');
const { startOrderMcpFixture } = await import('./support/order-mcp-fixture.ts');
const close = await startOrderMcpFixture();
const { customerServiceConfig } = await import('../apps/retail/src/mastra/agent.ts');
const { mastra } = await import('../apps/retail/src/mastra/index.ts');
const agent = mastra.getAgent('retailAgent');
const basePath = resolve('fixtures/product-care');
const snapshot = () => Object.fromEntries(readdirSync(basePath).sort().map(name => [name, readFileSync(resolve(basePath, name), 'utf8')]));
const before = snapshot();
const workspace = await agent.getWorkspace();
const filesystem = workspace?.filesystem;
assert.ok(filesystem, 'Agent has its configured filesystem');
assert.equal(filesystem.readOnly, true);
const evidence: object[] = [];
const failures: string[] = [];
try {
  await assert.rejects(filesystem.writeFile('unexpected.md', 'must not be written'));
  await assert.rejects(filesystem.readFile('../orders.json'));
  const tools = await agent.getToolsForExecution({});
  const names = Object.keys(tools);
  assert.ok(names.includes('mastra_workspace_read_file'));
  assert.ok(names.includes('mastra_workspace_grep'));
  for (const name of names) assert.doesNotMatch(name, /mastra_workspace_(write_file|edit_file|delete|mkdir|execute_command|ast_edit)$/);
  assert.equal(names.includes('skill'), customerServiceConfig.skills, 'Skill availability follows the lesson configuration');
  assert.doesNotMatch(JSON.stringify(await agent.getInstructions()), /product-care|workspace file tools|matching product document/i, 'No product-care routing in application instructions');
  evidence.push({ check: 'read-only and containment', tools: names, writeRejected: true, outsideReadRejected: true });
  for (const [prompt, source] of [
    ['How should I wash my Everyday jacket? Can I tumble dry it?', 'everyday-jacket.md'],
    ['Can I machine wash my Leather jacket?', 'leather-jacket.md'],
    ['How should I wash my Trench jacket?', null],
  ] as const) {
    const modelInputs: unknown[] = [];
    const result = await agent.generate(prompt, {
      memory: { resource: 'customer-alex', thread: randomUUID() },
      inputProcessors: [{ id: 'capture-product-care-input', processLLMRequest: ({ prompt }) => {
        modelInputs.push(JSON.parse(JSON.stringify(prompt)));
      } }],
    });
    evidence.push({ prompt, text: result.text, toolCalls: result.toolCalls, toolResults: result.toolResults,
      modelInputs, steps: result.steps.length, traceId: result.traceId });
    writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2));
    try {
      const calls = result.toolCalls.map(call => call.payload.toolName);
      assert.ok(calls.includes('mastra_workspace_grep') || calls.includes('mastra_workspace_list_files'), 'Discover relevant files');
      assert.ok(result.steps.length <= 12);
      assert.ok(result.text.trim());
      assert.ok(JSON.stringify(modelInputs[0]).includes('This directory contains product-care documents, including washing, drying, and storage guidance.'), 'Filesystem description reaches the first model input');
      assert.ok(JSON.stringify(modelInputs[0]).includes('For product-care questions, check these documents first before consulting other sources.'), 'Filesystem source priority reaches the first model input');
      assert.ok(JSON.stringify(modelInputs[0]).includes('File access is restricted to this directory.'), 'Default filesystem access context is preserved');
      for (const text of Object.values(before)) {
        const careParagraph = text.split('\n').find(line => line.startsWith('Close the zipper') || line.startsWith('Turn the jacket') || line.startsWith('Do not machine'))!;
        assert.ok(!JSON.stringify(modelInputs[0]).includes(careParagraph), 'Care instructions must not be preloaded');
      }
      if (source) {
        assert.ok(calls.includes('mastra_workspace_read_file'));
        const readCalls = result.toolCalls.filter(call => call.payload.toolName === 'mastra_workspace_read_file');
        // Discovery may include other sources; the matching document must still be read.
        assert.ok(readCalls.some(call => JSON.stringify(call.payload.args).includes(source)), 'Read the matching care document');
        const searchIndex = calls.findIndex(name => ['mastra_workspace_grep', 'mastra_workspace_list_files'].includes(name));
        assert.ok(searchIndex < calls.indexOf('mastra_workspace_read_file'), 'Discover before reading');
        // The built-in reader adds line numbers; verify every source line survives.
        const readResult = result.toolResults.find(tool => tool.payload.toolName === 'mastra_workspace_read_file' && JSON.stringify(tool.payload.args).includes(source))!;
        for (const line of before[source].split('\n').filter(Boolean)) {
          assert.ok(String(readResult.payload.result).includes(line), 'Read result contains source line');
          assert.ok(JSON.stringify(modelInputs.slice(1)).includes(JSON.stringify(line).slice(1, -1)), 'Source line reaches later model input');
        }
        if (source === 'everyday-jacket.md') {
          assert.match(result.text, /30/);
          assert.match(result.text, /(?:do not|don't|no|avoid|not)[^.\n]*tumble|tumble[^.\n]*(?:not|no)/i);
        } else assert.match(result.text, /(?:do not|don't|no|avoid|not)[^.\n]*machine|machine[^.\n]*(?:not|no)/i);
      } else {
        assert.match(result.text, /couldn.t|can.t|cannot|no .*care|don.t have|not.*(?:find|available|document|verif)/i);
        assert.doesNotMatch(result.text, /wash (?:cold|at 30)|gentle cycle|lay flat/i);
      }
      console.log(`File discovery and content checks passed: ${prompt} (${result.steps.length} steps)`);
    } catch (error) {
      failures.push(`${prompt}: ${String(error)}`);
      console.log(`Check failed: ${prompt}: ${String(error)}`);
    }
  }
  assert.deepEqual(snapshot(), before, 'Reference files unchanged');
  evidence.push({ check: 'rehearsal assertions', failures });
  writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2));
  assert.deepEqual(failures, [], 'All rehearsal assertions pass');
} finally {
  await mastra.observability.flush();
  await close();
  console.log(`Evidence: ${directory}/evidence.json`);
}
