import { createHash } from 'node:crypto';
export type Message = { role: string; content?: unknown; id?: string };
export function latestCustomerMessage(messages: readonly Message[]) {
  const message = [...messages].reverse().find(m => m.role === 'user');
  if (!message) throw new Error('A customer message is required');
  const content = message.content;
  const parts = Array.isArray(content) ? content : content && typeof content === 'object' && 'parts' in content && Array.isArray(content.parts) ? content.parts : [];
  const text = typeof content === 'string' ? content : parts.filter(p => p.type === 'text').map(p => p.text).join('');
  if (!text.trim() || text.length > 8000) throw new Error('A customer message of 1 to 8000 characters is required');
  // The ID keeps identical messages on separate customer turns distinct.
  const turn = createHash('sha256').update(JSON.stringify(message)).digest('hex');
  return {text, turn};
}

export function customerTurn(
  current: readonly Message[],
  fallback: readonly Message[] = [],
) {
  const user = [...current].reverse().find(m => m.role === 'user')
    ?? [...fallback].reverse().find(m => m.role === 'user');
  if (!user) throw new Error('A customer turn is required.');
  return createHash('sha256').update(JSON.stringify(user)).digest('hex');
}
