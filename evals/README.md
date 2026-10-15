# Evaluations

`npm run eval` currently checks a real Chapter 1 order lookup and persisted trace. It calls OpenAI and resets the fictional store first. Run `npm test` for offline order-ownership and working-memory persistence checks. `npm run rehearse:chapter1` also verifies built-in working-memory updates, recall across threads, customer isolation, and preference handling during exchanges. Later chapters will add exchange, guardrail, delegation, and recovery evaluations.
