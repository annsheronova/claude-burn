const PRICING = {
  opus: { input: 5, output: 25, cache_read: 0.5, cache_create: 6.25 },
  sonnet: { input: 3, output: 15, cache_read: 0.3, cache_create: 3.75 },
  haiku: { input: 1, output: 5, cache_read: 0.1, cache_create: 1.25 },
};

function getPricing(modelName) {
  if (!modelName) return PRICING.opus;
  if (modelName.includes('haiku')) return PRICING.haiku;
  if (modelName.includes('sonnet')) return PRICING.sonnet;
  return PRICING.opus;
}

function calculateSessionCost(modelStats) {
  let costIn = 0;
  let costOut = 0;
  let costCacheRead = 0;
  let costCacheCreate = 0;

  for (const [modelName, stats] of Object.entries(modelStats || {})) {
    const pricing = getPricing(modelName);
    costIn += stats.input / 1e6 * pricing.input;
    costOut += stats.output / 1e6 * pricing.output;
    costCacheRead += stats.cache_read / 1e6 * pricing.cache_read;
    costCacheCreate += stats.cache_create / 1e6 * pricing.cache_create;
  }

  const total = costIn + costOut + costCacheRead + costCacheCreate;

  return {
    input: Math.round(costIn * 100) / 100,
    output: Math.round(costOut * 100) / 100,
    cache_read: Math.round(costCacheRead * 100) / 100,
    cache_create: Math.round(costCacheCreate * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

module.exports = {
  PRICING,
  getPricing,
  calculateSessionCost,
};
