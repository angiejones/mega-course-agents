type Message = { role: string; content?: unknown };
/** Read the actual customer turn; never accept an LLM-supplied decision argument. */
export function customerDecision(current: readonly Message[], fallback: readonly Message[] = []) {
  const last = [...current].reverse().find(message => message.role === 'user')
    ?? [...fallback].reverse().find(message => message.role === 'user');
  const content = last?.content;
  const parts = Array.isArray(content) ? content
    : content && typeof content === 'object' && 'parts' in content && Array.isArray(content.parts) ? content.parts : [];
  const text = typeof content === 'string' ? content : parts.filter(part => part.type === 'text').map(part => part.text).join('');
  const decision = text.trim().toLowerCase();
  return decision === '1' ? 'confirm' : decision === '2' ? 'decline' : undefined;
}
