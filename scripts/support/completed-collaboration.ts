import type { Agent, ToolsInput } from '@mastra/core/agent';
import { resolutionTools } from '../../packages/collaboration/tools.ts';
import { shoppingAgent } from '../../agents/shopping/src/agent.ts';
import { contactRetailer } from '../../agents/shopping/src/contact-retailer.ts';

// Isolated verification only. Studio uses the registrations in agent.ts.
// Mastra's internal setter lets this harness add tools without editing learner files.
export async function registerCompletedCollaboration(agent: Agent<string, ToolsInput>) {
  agent.__setTools({ ...await agent.listTools(), ...resolutionTools });
  shoppingAgent.__setTools({ ...await shoppingAgent.listTools(), contactRetailer });
}
