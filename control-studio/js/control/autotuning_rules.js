/**
 * autotuning_rules.js — Classical PID auto-tuning rules.
 *
 * Loop 7 (Zero-Flaw) addition. Implements the canonical batch tuning
 * formulae from process control literature:
 *
 *   Ziegler-Nichols open-loop (FOPDT plant K e^{-L s} / (T s + 1)):
 *     P:    K_p = T / (K L)
 *     PI:   K_p = 0.9 T / (K L),  T_i = L / 0.3
 *     PID:  K_p = 1.2 T / (K L),  T_i = 2 L,  T_d = 0.5 L
 *
 *   Ziegler-Nichols closed-loop (ultimate gain K_u, ultimate period T_u):
 *     P:    K_p = 0.5 K_u
 *     PI:   K_p = 0.45 K_u,  T_i = T_u / 1.2
 *     PID:  K_p = 0.6 K_u,   T_i = T_u / 2,  T_d = T_u / 8
 *
 *   Tyreus-Luyben (less aggressive ZN closed-loop):
 *     PI:   K_p = K_u / 3.2,  T_i = 2.2 T_u
 *     PID:  K_p = K_u / 2.2,  T_i = 2.2 T_u,  T_d = T_u / 6.3
 *
 *   Cohen-Coon (open-loop FOPDT, better damping than ZN open-loop):
 *     PID:  K_p = (T/(K L)) (4/3 + L/(4 T))
 *           T_i = L (32 + 6 L/T) / (13 + 8 L/T)
 *           T_d = L · 4 / (11 + 2 L/T)
 *
 *   AMIGO (Åström-Hägglund 2004) for FOPDT:
 *     PID:  K_p = (1/K) (0.2 + 0.45 T / L)
 *           T_i = (0.4 L + 0.8 T) / (L + 0.1 T) · L
 *           T_d = (0.5 L T) / (0.3 L + T)
 *
 * Reference:
 *   - Ziegler, Nichols, "Optimum settings for automatic controllers",
 *     Trans. ASME, 1942.
 *   - Tyreus, Luyben, "Tuning PI controllers for integrator/dead time
 *     processes", I&EC Research, 1992.
 *   - Cohen, Coon, "Theoretical consideration of retarded control",
 *     Trans. ASME, 1953.
 *   - Åström, Hägglund, "Advanced PID Control", ISA, 2006 §4.
 */

function ensureFOPDT(params) {
  const { K, T, L } = params;
  if (!Number.isFinite(K) || !Number.isFinite(T) || !Number.isFinite(L)) {
    throw new Error('FOPDT: K, T, L must all be finite');
  }
  if (!(T > 0)) throw new Error('FOPDT: time constant T must be > 0');
  if (!(L > 0)) throw new Error('FOPDT: dead time L must be > 0');
  if (K === 0) throw new Error('FOPDT: static gain K must be non-zero');
  return params;
}

function ensureUltimate(params) {
  const { Ku, Tu } = params;
  if (!(Ku > 0)) throw new Error('ultimate: K_u must be > 0');
  if (!(Tu > 0)) throw new Error('ultimate: T_u must be > 0');
  return params;
}

export const ZN_OPEN = {
  p({ K, T, L }) { ensureFOPDT({ K, T, L }); return { Kp: T / (K * L), Ti: Infinity, Td: 0 }; },
  pi({ K, T, L }) { ensureFOPDT({ K, T, L }); return { Kp: 0.9 * T / (K * L), Ti: L / 0.3, Td: 0 }; },
  pid({ K, T, L }) { ensureFOPDT({ K, T, L }); return { Kp: 1.2 * T / (K * L), Ti: 2 * L, Td: 0.5 * L }; },
};

export const ZN_CLOSED = {
  p({ Ku }) { ensureUltimate({ Ku, Tu: 1 }); return { Kp: 0.5 * Ku, Ti: Infinity, Td: 0 }; },
  pi({ Ku, Tu }) { ensureUltimate({ Ku, Tu }); return { Kp: 0.45 * Ku, Ti: Tu / 1.2, Td: 0 }; },
  pid({ Ku, Tu }) { ensureUltimate({ Ku, Tu }); return { Kp: 0.6 * Ku, Ti: Tu / 2, Td: Tu / 8 }; },
};

export const TYREUS_LUYBEN = {
  pi({ Ku, Tu }) { ensureUltimate({ Ku, Tu }); return { Kp: Ku / 3.2, Ti: 2.2 * Tu, Td: 0 }; },
  pid({ Ku, Tu }) { ensureUltimate({ Ku, Tu }); return { Kp: Ku / 2.2, Ti: 2.2 * Tu, Td: Tu / 6.3 }; },
};

export const COHEN_COON = {
  pid({ K, T, L }) {
    ensureFOPDT({ K, T, L });
    const r = L / T;
    return {
      Kp: (T / (K * L)) * (4 / 3 + r / 4),
      Ti: L * (32 + 6 * r) / (13 + 8 * r),
      Td: L * 4 / (11 + 2 * r),
    };
  },
};

export const AMIGO = {
  pid({ K, T, L }) {
    ensureFOPDT({ K, T, L });
    return {
      Kp: (1 / K) * (0.2 + 0.45 * T / L),
      Ti: ((0.4 * L + 0.8 * T) / (L + 0.1 * T)) * L,
      Td: (0.5 * L * T) / (0.3 * L + T),
    };
  },
};

/**
 * Convert (Kp, Ti, Td) form to (Kp, Ki, Kd) for ControlStudio's PID core.
 */
export function toParallelGains({ Kp, Ti, Td }) {
  return {
    Kp,
    Ki: Number.isFinite(Ti) && Ti > 0 ? Kp / Ti : 0,
    Kd: Td > 0 ? Kp * Td : 0,
  };
}
