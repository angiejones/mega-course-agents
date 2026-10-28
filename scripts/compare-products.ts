import { database } from "../packages/collaboration/storage.ts";
import { source } from "../agents/supplier/src/service.ts";
import { compare, evaluate } from "../packages/collaboration/comparison.ts";
const db = database(":memory:");
try {
  const requirements = {
    size: "9",
    deadline: new Date(Date.now() + 72 * 3600000).toISOString(),
    maxPriceCents: 9900,
    preferences: "Formal black wedding shoes with cushioning",
  };
  const candidates = source(db, requirements);
  let pending = Promise.resolve();
  const sequential = await compare(candidates, requirements, (candidate, input) => {
    const result = pending.then(() => evaluate(candidate, input));
    pending = result.then(() => undefined, () => undefined);
    return result;
  });
  const parallel = await compare(candidates, requirements);
  console.log(JSON.stringify({ sequential, parallel }, null, 2));
  if ([...sequential.results, ...parallel.results].some((r) => r.error))
    process.exitCode = 1;
} finally {
  db.close();
}
