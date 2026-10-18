import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Workspace, LocalSkillSource } from '@mastra/core/workspace';
const directory = resolve('data/missing-item', randomUUID());
mkdirSync(directory, { recursive: true });
process.env.STORE_DB_PATH = resolve(directory, 'store.db');
process.env.AGENT_DB_PATH = resolve(directory, 'agent.db');
const { startOrderMcpFixture } = await import('./support/order-mcp-fixture.ts');
const close = await startOrderMcpFixture();
const { mastra } = await import('../apps/retail/src/mastra/index.ts');
const { openExchangeStore, seedExchangeStore } = await import('../packages/exchanges/store.ts');
const agent = mastra.getAgent('retailAgent');
const original = await agent.getWorkspace();
const db = openExchangeStore(process.env.STORE_DB_PATH);
seedExchangeStore(db);
const instructions = String(await agent.getInstructions());
assert.doesNotMatch(instructions, /missing-item-investigation|missing-delivery|match that SKU|orders_getShipments/, 'No investigation procedure or routing in system instructions');
const evidence: any[] = [];
const failures: string[] = [];
try {
    for (const enabled of [false, true]) {
        agent.__setWorkspace(new Workspace({ filesystem: original?.filesystem, ...(enabled ? { skillSource: new LocalSkillSource({ basePath: resolve('.') }), skills: [resolve('apps/retail/skills')] } : {}) }));
        assert.equal(String(await agent.getInstructions()), instructions, 'Same application system instructions in both conditions');
        for (const [orderId, branch] of [['order-1004', 'in_transit'], ['order-1005', 'delivered'], ['order-1006', 'unshipped']]) {
            const modelInputs: unknown[] = [];
            const prompt = `My order says delivered, but the rain jacket wasn't in the box. Can you send another one? My order number is ${orderId}.`;
            const result = await agent.generate(prompt, { maxSteps: 12, memory: { resource: 'customer-alex', thread: randomUUID() }, inputProcessors: [{ id: 'capture-investigation', processLLMRequest: ({ prompt }) => { modelInputs.push(JSON.parse(JSON.stringify(prompt))); } }] });
            const calls = result.toolCalls.map(t => ({ name: t.payload.toolName, args: t.payload.args }));
            const index = (name: string) => calls.findIndex(c => c.name === name);
            const track = calls.filter(c => c.name === 'orders_getTracking');
            const checks: Record<string, boolean> = {
                answered: !!result.text.trim(), withinStepLimit: result.steps.length <= 12,
                verifiedBeforeShipments: index('orders_getOrder') >= 0 && index('orders_getShipments') > index('orders_getOrder'),
                noExchangePath: !calls.some(c => ['exchangeWithConfirmation', 'confirmExchange', 'getInventory'].includes(c.name)),
                noCodeMode: !calls.some(c => c.name === 'execute_typescript'),
                matchingTracking: branch === 'unshipped' ? track.length === 0 : track.length === 1 && JSON.stringify(track[0].args).includes(`track-${orderId.slice(-4)}-jacket`),
                casesOnlyWhenNeeded: branch === 'in_transit' ? index('orders_getSupportCases') < 0 : index('orders_getSupportCases') >= 0,
                correctAnswer: branch === 'in_transit' ? /transit|on (?:its|the) way|separat/i.test(result.text) : result.text.includes(`case-${orderId.slice(-4)}`),
            };
            const readReference = calls.some(c => c.name === 'skill_read' && JSON.stringify(c.args).includes('missing-delivery.md'));
            if (enabled) {
                checks.skillLoaded = calls.some(c => c.name === 'skill' && JSON.stringify(c.args).includes('missing-item-investigation'));
                checks.branchReference = branch === 'delivered' ? readReference : !readReference;
                checks.referenceAfterTracking = !readReference || index('skill_read') > index('orders_getTracking');
                checks.progressiveDisclosure = !JSON.stringify(modelInputs[0]).includes('For an incomplete parcel, collect');
            }
            else
                checks.noSkillTool = !calls.some(c => c.name === 'skill' || c.name === 'skill_read');
            evidence.push({ enabled, orderId, branch, prompt, text: result.text, calls, toolResults: result.toolResults, modelInputs, steps: result.steps.length, checks });
            writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2));
            const failed = Object.entries(checks).filter(([, pass]) => !pass).map(([key]) => key);
            console.log(JSON.stringify({ enabled, branch, steps: result.steps.length, calls: calls.map(c => c.name), failed, text: result.text }));
            if (enabled && failed.length)
                failures.push(`${branch}: ${failed.join(', ')}`);
            assert.equal(db.prepare('SELECT count(*) AS n FROM exchanges').get()?.n, 0);
        }
    }
    assert.deepEqual(failures, [], 'Skill-enabled cases must follow the investigation procedure');
}
finally {
    db.close();
    await mastra.observability.flush();
    await close();
    console.log(`Evidence: ${directory}/evidence.json`);
}
