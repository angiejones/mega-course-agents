# Carrier delivery investigation

This independent service owns delivery scan evidence, driver notes, photo descriptions and recovery schedules. Its agent retrieves shipment evidence, chooses clarification questions when customer facts are missing, and assesses the answers. Questions and answers remain free text so the investigation can continue across multiple turns. Code compares the retrieved recovery schedule with the deadline and returns structured findings. Customer identity and store order history remain with the retailer.

Run `npm run serve:carrier` after preparing the store. The service requires `CARRIER_TOKEN`, advertises A2A v1 at `/a2a`, and publishes its card at `/.well-known/agent-card.json`. Task records persist in `carrier-tasks.db` under the selected retail store directory, unless a collaboration directory override is configured.

The evidence adapter contains fictional records. See `docs/multi-agent-collaboration.md` for setup and deployment boundaries.
