# A2A command-line utility

This utility sends a customer message to the authenticated retail service and prints the A2A response. It remains useful for protocol checks; it is not an agent.

For the personal shopping agent and its separate Mastra Studio app, use `npm run dev:shopping` and see `agents/shopping/README.md`.

For a direct protocol request, use `npm run shopping -- 'your request'`. Follow up with `npm run shopping -- 'your answer' TASK_ID CONTEXT_ID`. The utility requires the retail gateway and `SHOPPING_TOKEN`.
