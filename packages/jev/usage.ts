import { AsyncLocalStorage } from 'node:async_hooks';

export type JevCall = { model: string; status: 'pending' | 'completed' | 'failed'; usage?: unknown };
const calls = new AsyncLocalStorage<JevCall[]>();
export const withJevUsage = <T>(records: JevCall[], action: () => T): T => calls.run(records, action);

// Record each SDK call once, even when it asks multiple questions.
export async function recordJevCall<T extends { model: string; usage?: unknown }>(model: string, action: () => Promise<T>): Promise<T> {
  const record: JevCall = { model, status: 'pending' };
  calls.getStore()?.push(record);
  try {
    const result = await action();
    Object.assign(record, { model: result.model, status: 'completed', usage: result.usage });
    return result;
  } catch (error) {
    record.status = 'failed';
    throw error;
  }
}
