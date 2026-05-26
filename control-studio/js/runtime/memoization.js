/**
 * memoization.js - Tier I3: small LRU memoization layer.
 */

export function stableHash(value) {
  return JSON.stringify(value, (_, v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? Number(v.toPrecision(14)) : String(v);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce((out, key) => {
        out[key] = v[key];
        return out;
      }, {});
    }
    return v;
  });
}

export function memoize(fn, hashKey = (...args) => stableHash(args), limit = 100) {
  const cache = new Map();
  const wrapped = (...args) => {
    const key = hashKey(...args);
    if (cache.has(key)) {
      const value = cache.get(key);
      cache.delete(key);
      cache.set(key, value);
      wrapped.stats.hits++;
      return value;
    }
    const value = fn(...args);
    cache.set(key, value);
    if (cache.size > limit) cache.delete(cache.keys().next().value);
    wrapped.stats.misses++;
    return value;
  };
  wrapped.stats = { hits: 0, misses: 0, size: () => cache.size };
  wrapped.clear = () => cache.clear();
  return wrapped;
}

export default { stableHash, memoize };
