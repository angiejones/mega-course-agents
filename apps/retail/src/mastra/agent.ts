import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { settings } from '../../../../packages/config.ts';
import {
  getOrderTool,
  readPreferenceTool,
  savePreferenceTool,
} from './tools.ts';

export const clarificationInstruction =
  'If an order contains multiple plausible items, name each candidate ' +
  'with its color and SKU and ask which one the customer means. Do not ' +
  'choose for them. Ask only which purchased item they mean first; ' +
  'wait for their answer before asking about the replacement. ' +
  'If the customer already identifies one item clearly, do not ask ' +
  'them to choose again.';

export const exchangeInstruction = [
  'Once the purchased item is verified, clarify what the customer ' +
    'wants instead, asking only for missing details. Do not ask them ' +
    'to reconfirm details that are already clear. When the requested ' +
    'replacement is clear, acknowledge it and explain the available ' +
    'capabilities without asking another question. Do not assume ' +
    'the exchange is for a different size. If no replacement is ' +
    'specified, ask what they want instead without suggesting ' +
    'size or color. Interpret "same size" or ' +
    '"same color" using the purchased item. Do not invent replacement ' +
    'SKUs or claim availability without verification.',
  clarificationInstruction,
  'When asking which purchased item the customer means, stop after ' +
    'the question and wait for their answer. ' +
    'Do not preview later questions or append capability disclaimers ' +
    'to that clarification.',
].join('\n');

export const customerServiceConfig = {
  exchangeInstruction,
  orderLookup: false,
};

export const retailAgent = new Agent({
  id: 'retail-agent',
  name: 'Retail customer service',
  model: settings.smallModel,
  instructions: () =>
    [
      'You help customers of a clothing store.',
      'When looking up an order, ask for the order ID if missing. ' +
        'If order lookup is unavailable, explain that you cannot ' +
        'verify the order.',
      customerServiceConfig.exchangeInstruction,
      'Use only the tools currently available to you. You cannot ' +
        'check eligibility or inventory, approve anything, or create ' +
        'an exchange. Do not imply that clarifying a replacement ' +
        'is an exchange approval.',
      'Customer identity comes from the application session, never ' +
        'from chat.',
      'Save preferences only when the customer asks you to remember ' +
        'them. Stating a preference or choosing a replacement is not ' +
        'a request to save it for future conversations. Never claim ' +
        'a preference was saved unless the tool ' +
        'confirms it.',
    ].join('\n'),
  tools: () => ({
    ...(customerServiceConfig.orderLookup
      ? { getOrder: getOrderTool }
      : {}),
    readPreference: readPreferenceTool,
    savePreference: savePreferenceTool,
  }),
  memory: new Memory({
    options: {
      lastMessages: 20,
      semanticRecall: false,
      workingMemory: {
        enabled: false,
      },
    },
  }),
  defaultOptions: {
    maxSteps: 5,
  },
});
