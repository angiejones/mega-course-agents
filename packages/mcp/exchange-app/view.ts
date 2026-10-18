import { App } from '@modelcontextprotocol/ext-apps';
declare const __BLUE_SHIRT_IMAGE__: string;
type CallToolResult = Awaited<ReturnType<App['callServerTool']>>;
const app = new App({ name: 'MEGA Store exchange', version: '1.0.0' }, {});
const element = (id: string) => document.getElementById(id)!;
let token: string | undefined;
let busy = false;
const money = (value: unknown, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value) / 100);
function data(result: CallToolResult) {
  if (result.isError) throw new Error(result.content.filter(c => c.type === 'text').map(c => c.text).join('\n') || 'Unable to complete this request.');
  if (result.structuredContent) return result.structuredContent as Record<string, any>;
  const text = result.content.find(c => c.type === 'text');
  if (!text || text.type !== 'text') throw new Error('No exchange details were returned.');
  return JSON.parse(text.text) as Record<string, any>;
}
function product(id: string, item: Record<string, any>, quantity: number) {
  const card = element(id);
  card.querySelector('h2')!.textContent = String(item.name);
  card.querySelector('.size')!.textContent = `Size ${item.size}`;
  card.querySelector('p')!.textContent = `Quantity ${quantity}, ${item.sku}`;
  if (String(item.sku).startsWith('jacket-blue-')) {
    const image = document.createElement('img');
    image.src = __BLUE_SHIRT_IMAGE__;
    image.alt = 'Blue button-front shirt';
    card.querySelector('.image')!.replaceChildren(image);
    return;
  }
  const colors: Record<string,string> = { blue: '#3b5d7e', brown: '#856044', red: '#a34e46', white: '#d5d3ca' };
  // Inline product artwork requires no third-party image request from the client's sandbox.
  card.querySelector('.image')!.innerHTML = `<svg viewBox="0 0 240 180" role="img" aria-label="Jacket"><path d="M87 20 65 28 25 78 49 99 72 72 72 160 168 160 168 72 191 99 215 78 175 28 153 20 120 34Z" fill="${colors[item.color] || '#61766b'}" stroke="#273c4b" stroke-width="2"/><path d="m87 20 33 14-14 25-22-33m69-6-33 14 14 25 22-33M120 35v125M81 110l24 8m54-8-24 8" fill="none" stroke="#c5d4df" stroke-width="2"/><path d="M75 151h90M33 79l15 13m144 0 15-13" stroke="#273c4b" stroke-width="4"/></svg>`;
}
function render(result: CallToolResult) {
  const value = data(result);
  element('heading').textContent = 'Review your exchange';
  element('outcome').hidden = true;
  token = value.status === 'awaiting_confirmation' ? value.confirmationToken : undefined;
  element('actions').hidden = !token;
  if (value.proposal && value.items) {
    const p = value.proposal;
    product('original', value.items[0], p.quantity);
    product('replacement', value.items[1], p.quantity);
    element('details').hidden = false;
    for (const [id, field] of [['credit','creditCents'],['cost','replacementCents'],['fee','feeCents'],['due','differenceCents']]) element(id).textContent = money(p[field], p.currency);
    element('status').textContent = `Order ${p.orderId}. Review the items and amount before confirming.`;
  }
  if (!token) {
    const titles: Record<string, string> = { committed: 'Exchange confirmed', declined: 'Exchange declined', rejected: 'Exchange unavailable', clarify: 'More information needed', human_review: 'Sent for review' };
    element('outcome-heading').textContent = titles[value.status] || 'Exchange update';
    element('outcome-message').textContent = value.status === 'committed'
      ? `The store is awaiting the return of your original item.${value.receipt?.exchangeId ? ` Exchange ${value.receipt.exchangeId}.` : ''}`
      : value.status === 'declined' ? 'Your order is unchanged.' : value.message;
    element('outcome').hidden = false;
    if (element('details').hidden) element('status').textContent = 'See the result below.';
  }
  document.querySelector<HTMLElement>('.note')!.hidden = !token;
}
app.ontoolresult = result => { try { render(result); } catch (error) { element('error').textContent = String(error); } };
async function decide(decision: 'confirm' | 'decline') {
  if (!token || busy) return;
  busy = true;
  element('error').textContent = '';
  document.querySelectorAll('button').forEach(button => button.disabled = true);
  try {
    // The host forwards this call to the same MCP server. The model does not choose the decision.
    const result = await app.callServerTool({ name: 'decideExchange', arguments: { confirmationToken: token, decision } });
    render(result);
    if (!element('outcome').hidden) {
      element('outcome').focus({ preventScroll: true });
      element('outcome').scrollIntoView({ block: 'nearest' });
    }
    try { await app.updateModelContext({ content: [{ type: 'text', text: JSON.stringify(data(result)) }] }); }
    catch { /* The card already displays the authoritative result even if context update is unavailable. */ }
  } catch (error) { element('error').textContent = String(error); }
  finally { busy = false; document.querySelectorAll('button').forEach(button => button.disabled = false); }
}
element('confirm').addEventListener('click', () => void decide('confirm'));
element('decline').addEventListener('click', () => void decide('decline'));
void app.connect().catch(error => { element('error').textContent = `Unable to connect to the agent client: ${String(error)}`; });
