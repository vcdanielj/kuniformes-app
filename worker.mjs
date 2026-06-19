import appWorker, {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache,
} from "./.open-next/worker.js";
import { syncDolarApiRates } from "./src/lib/exchange-rates/service.ts";

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache };

async function runScheduledRatesSync(env) {
  const result = await syncDolarApiRates({
    bindings: env,
    includeHistory: true,
  });

  if (!result.success) {
    console.error("Cron sync de tasas fallo y quedo en fallback.", result.error);
    return;
  }

  console.log(`Cron sync de tasas OK. Snapshots insertados: ${result.inserted}`);
}

export default {
  async fetch(request, env, ctx) {
    return appWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledRatesSync(env));
    console.log(`Cron ejecutado: ${controller.cron}`);
  },
};
