/**
 * loader.js - Tier I1: WebAssembly compute-core adapter baseline.
 */

export function createWasmAdapter({ module = null, fallback = {} } = {}) {
  return {
    available: !!module,
    call(name, args = {}) {
      if (module && typeof module[name] === 'function') return module[name](args);
      if (typeof fallback[name] === 'function') return fallback[name](args);
      throw new Error(`WASM function unavailable: ${name}`);
    },
    compare(name, args, jsFn, tol = 1e-12) {
      const wasmResult = this.call(name, args);
      const jsResult = jsFn(args);
      const diff = Math.abs(Number(wasmResult) - Number(jsResult));
      return { wasmResult, jsResult, diff, pass: diff <= tol };
    },
  };
}

export function flattenFloat64(matrix) {
  return new Float64Array(matrix.flat());
}

export default { createWasmAdapter, flattenFloat64 };
