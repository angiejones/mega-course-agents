import { customerServiceEmail, privateStaffEmails } from './contact-policy.ts';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { InputProcessor, OutputProcessor } from '@mastra/core/processors';

export type GuardEvent = { stage: string; action: string; count?: number };
const eventStorage = new AsyncLocalStorage<GuardEvent[]>();
export function withGuardrailEvents<T>(events: GuardEvent[], action: () => T): T {
  return eventStorage.run(events, action);
}
// This narrow rule detects digit-form payment cards, not all sensitive data.
export function cardCandidates(text: string): string[] {
  return (text.match(/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g) ?? []).filter(raw => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
    let sum = 0;
    for (let i=digits.length-1, double=false;i>=0;i--,double=!double) {
      let n=Number(digits[i]); if(double) { n*=2; if(n>9)n-=9; } sum+=n;
    }
    return sum % 10 === 0;
  });
}
export const replacePrivateStaffEmails = (text: string) => text.replace(
  /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi,
  address => {
    const prefix = address.match(/^\*+/)?.[0] ?? '';
    const email = address.slice(prefix.length);
    return privateStaffEmails.includes(email.toLowerCase()) ? prefix + customerServiceEmail : address;
  },
);
function retailGuardrails() {
  const record = (event: GuardEvent) => eventStorage.getStore()?.push(event);
  const input: InputProcessor = {
    id:'retail-payment-card-input',
    processInput({messages,abort}) {
      const latest=messages.filter(m=>m.role==='user').at(-1);
      const text=latest?.content.parts.filter(p=>p.type==='text').map(p=>p.text).join('\n') ?? '';
      if(cardCandidates(text).length) {
        record({stage:'input',action:'blocked'});
        abort('Please remove the full payment card number. Use the secure payment channel; the retail assistant does not need it.');
      }
      record({stage:'input',action:'allowed'});
      return messages;
    },
  };
  const output: OutputProcessor = {
    id:'retail-contact-output',
    processOutputResult({messages}) {
      let count=0;
      const updated=messages.map(m=> {
        if(m.role!=='assistant')return m;
        const legacy=typeof m.content.content==='string'?replacePrivateStaffEmails(m.content.content):m.content.content;
        if(legacy!==m.content.content)count++;
        return {...m,content:{...m.content,content:legacy,parts:m.content.parts.map(p=>{
        if(p.type!=='text')return p;
        const text=replacePrivateStaffEmails(p.text); if(text!==p.text)count++;
        return {...p,text};
      })}};
      });
      record({stage:'output',action:count?'replaced':'allowed',count});
      return updated;
    },
  };
  return {inputProcessors:[input],outputProcessors:[output]};
}

const guardrails = retailGuardrails();
export const paymentCardGuardrail = guardrails.inputProcessors[0];
export const staffContactGuardrail = guardrails.outputProcessors[0];
