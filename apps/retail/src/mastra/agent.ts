import { exchangeTool, confirmExchangeTool } from '../../../../packages/exchanges/tool.ts';
import { inventoryTool } from '../../../../packages/exchanges/inventory-tool.ts';
import { Agent, type ToolsInput } from '@mastra/core/agent';
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
  orderLookup: true,
};

export const retailAgent = new Agent<string, ToolsInput>({
  id: 'retail-agent',
  name: 'Retail customer service',
  model: settings.smallModel,
  instructions: () =>
    [
      'You help customers of a clothing store.',
      'When looking up an order, ask for the order ID if missing. ' +
        'If order lookup is unavailable, explain that you cannot ' +
        'verify the order.',
      'Help the customer exchange a purchased item. Verify the order with getOrder, identify the requested replacement with getInventory, then call exchangeWithConfirmation. Ask only for missing details. Use the customer-provided issue description in the workflow. The workflow checks eligibility, classifies the issue, calculates the quote, and pauses for explicit customer confirmation. Never claim an exchange exists until the workflow returns committed. A saved preference is not confirmation.',
      'Use only verified order, inventory and workflow results. If a workflow pauses, present its proposal and wait for the customer. Present the replacement, quantity, credit, price and amount due from the proposal. Ask the customer to reply 1 to confirm or 2 to decline. On that reply call confirmExchange; never infer approval from the original request. Do not start another exchange while confirmation is pending.',
      'When the workflow returns human_review with a saved referral, apologize for the reported problem and say you have referred the exchange request to our quality team for review. Leave out stock availability and internal status language. Do not promise approval, a response time, or contact that has not happened. If no referral was saved, do not claim it was routed.',
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
    getInventory: inventoryTool,
    exchangeWithConfirmation: exchangeTool,
    confirmExchange: confirmExchangeTool,
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
