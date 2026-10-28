import type { DatabaseSync } from 'node:sqlite';
import type { Remote, } from '../../../packages/collaboration/resolution.ts';
import type { RemoteResult } from '../../../packages/collaboration/client.ts';
import { read, write } from '../../../packages/collaboration/storage.ts';

import { latestCustomerMessage, type Message } from '../../../packages/collaboration/customer-message.ts';
export { latestCustomerMessage } from '../../../packages/collaboration/customer-message.ts';
export class ShoppingDelegation {
  constructor(readonly db: DatabaseSync, readonly retail: Remote) {}
  async forward(customer: string, thread: string, messages: readonly Message[]) {
    if (!thread) throw new Error('A shopping conversation is required');
    const {text, turn} = latestCustomerMessage(messages);
    const scope = JSON.stringify(['shopping', customer, thread]);
    const previous = read<{ turn: string; result: RemoteResult }>(this.db, scope, 'active');
    if (previous?.turn === turn) return previous.result;
    if (previous?.result.state === 'working') throw new Error('The retailer is still working; do not start a duplicate task');
    const continuing = previous?.result.state === 'input-required' ? previous.result : undefined;
    // Forward actual customer text, never an LLM-written message or approval.
    const result = await this.retail.send(text, continuing);
    write(this.db, scope, 'active', {turn, result});
    return result;
  }
}
