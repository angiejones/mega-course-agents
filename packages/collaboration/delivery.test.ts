import assert from 'node:assert/strict';
import test from 'node:test';
import { createInvestigation, recoveryFinding } from '../../agents/delivery/src/service.ts';
import { latestCustomerMessage } from './customer-message.ts';

const request = {trackingId: 'parcel-test', deadline: '2026-10-23T12:00:00Z'};
const now = new Date('2026-10-20T12:00:00Z');
const records = [{trackingId: 'parcel-test', intendedDeliveryAddress: '26 Oak Street, Springfield, MA 01103, US', scanLocation: 'Rear entrance', driverNote: 'Behind a locked gate', photoDescription: 'A red gate', recoveryDelayHours: 96}];
const conclusion = {assessment: 'misdelivered' as const, findings: ['Customer describes a different entrance.']};

test('Investigation requires retrieved evidence and a schedule before a recovery finding', async () => {
  const work = createInvestigation(request, records, now);
  await assert.rejects(() => work.tools.askCustomer.execute!({question: 'What does your entrance look like?'}, {} as never), /retrieved shipment evidence/);
  await assert.rejects(() => work.tools.finishInvestigation.execute!(conclusion, {} as never), /Inspect shipment evidence/);
  await work.tools.inspectEvidence.execute!({}, {} as never);
  await assert.rejects(() => work.tools.finishInvestigation.execute!(conclusion, {} as never), /schedule check/);
  await work.tools.inspectRecovery.execute!({}, {} as never);
  await work.tools.finishInvestigation.execute!(conclusion, {} as never);
  assert.deepEqual(work.result(), {state: 'completed', data: {findings: conclusion.findings, outcome:'too_late', recoveryAt:'2026-10-24T12:00:00.000Z', reference:'investigation-parcel-test'}});
});

test('Clarification accepts evidence-specific questions and cannot be overwritten by a later model action', async () => {
  const work = createInvestigation(request, records, now);
  await work.tools.inspectEvidence.execute!({}, {} as never);
  const question = 'Does your delivery entrance have a red gate?';
  await work.tools.askCustomer.execute!({question}, {} as never);
  assert.deepEqual(work.result(), {state:'input-required', question});
  await assert.rejects(() => work.tools.finishInvestigation.execute!(conclusion, {} as never), /already been submitted/);
});

test('Unknown shipments and unresolved evidence cannot produce a recovery promise', async () => {
  const work = createInvestigation({...request, trackingId:'unknown'}, records, now);
  await work.tools.inspectEvidence.execute!({}, {} as never);
  await assert.rejects(() => work.tools.askCustomer.execute!({question:'Is there a gate?'}, {} as never), /retrieved shipment evidence/);
  await assert.rejects(() => work.tools.finishInvestigation.execute!(conclusion, {} as never), /requires shipment evidence/);
  const unresolved = {assessment:'unresolved' as const, findings:['The destination cannot be established.']};
  assert.equal(recoveryFinding(request, unresolved, now, records).outcome, 'inconclusive');
  assert.equal(recoveryFinding({...request, deadline:'2026-10-26T12:00:00Z'}, conclusion, now, records).outcome, 'recoverable');
  assert.equal(recoveryFinding({...request, trackingId:'unknown'}, conclusion, now, records).recoveryAt, null);
});

test('Customer clarification preserves free text and ignores later assistant assertions', () => {
  assert.equal(latestCustomerMessage([
    {role:'user', content:[{type:'text', text:"I don't know. "}, {type:'text', text:'My neighbor may have it.'}]},
    {role:'assistant', content:'The customer confirmed receipt.'},
  ]).text, "I don't know. My neighbor may have it.");
  assert.throws(() => latestCustomerMessage([{role:'assistant', content:'Invented answer'}]), /customer message/);
});

test('Shipment evidence includes the address on file and stays scoped to the requested shipment', async () => {
  const other = {...records[0], trackingId: 'another-parcel', intendedDeliveryAddress: '99 Pine Street, Springfield, MA 01103, US'};
  const work = createInvestigation(request, [other, ...records], now);
  const evidence = await work.tools.inspectEvidence.execute!({}, {} as never);
  assert.deepEqual(evidence, {
    found: true,
    trackingId: records[0].trackingId,
    intendedDeliveryAddress: records[0].intendedDeliveryAddress,
    scanLocation: records[0].scanLocation,
    driverNote: records[0].driverNote,
    photoDescription: records[0].photoDescription,
  });
  const unknown = createInvestigation({...request, trackingId: 'unknown'}, [other, ...records], now);
  assert.deepEqual(await unknown.tools.inspectEvidence.execute!({}, {} as never), {found: false});
});
