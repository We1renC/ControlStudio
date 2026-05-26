/**
 * compute_worker.js - Tier I2: abortable async compute worker facade.
 */

export function createComputeWorker(registry = {}) {
  let aborted = false;
  return {
    register(name, fn) {
      registry[name] = fn;
    },
    async run(name, payload) {
      aborted = false;
      if (typeof registry[name] !== 'function') throw new Error(`unknown compute job: ${name}`);
      await Promise.resolve();
      if (aborted) throw new Error('compute job aborted');
      const result = await registry[name](payload);
      if (aborted) throw new Error('compute job aborted');
      return { name, result };
    },
    abort() {
      aborted = true;
    },
  };
}

export default { createComputeWorker };
