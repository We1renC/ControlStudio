export const CONTROL_VERIFICATION_CASES = [
  {
    id: 'case-1-first-order-lag',
    title: 'Stable first-order lag',
    payload: {
      system: { type: 'transfer_function', num: [1], den: [1, 1] },
      simulation: { mode: 'open_loop', inputWaveform: 'step', duration: 8, sampleCount: 800, amplitude: 1 },
    },
    expected: {
      plant: { num: [1], den: [1, 1], poles: [{ re: -1, im: 0 }], stable: true, dcGain: 1 },
      response: { finalValue: 1, tolerance: 0.002 },
      bode: { lowFrequencyMagDB: 0, tolerance: 0.05 },
      cli: { plantFormula: '(1) / (s +1)', closedLoopFormula: '(1) / (s +1)' },
    },
  },
  {
    id: 'case-2-underdamped-second-order',
    title: 'Underdamped second-order system',
    payload: {
      system: { type: 'transfer_function', num: [4], den: [1, 2, 4] },
      simulation: { mode: 'open_loop', inputWaveform: 'step', duration: 10, sampleCount: 1200, amplitude: 1 },
    },
    expected: {
      plant: {
        num: [4],
        den: [1, 2, 4],
        poles: [{ re: -1, im: Math.sqrt(3) }, { re: -1, im: -Math.sqrt(3) }],
        stable: true,
        dcGain: 1,
      },
      response: { finalValue: 1, tolerance: 0.002 },
      stepInfo: { overshoot: 16.303, overshootTolerance: 0.5, settlingTime: 4, settlingTolerance: 0.5 },
      cli: { plantFormula: '(4) / (s^2 +2s +4)', closedLoopFormula: '(4) / (s^2 +2s +4)' },
    },
  },
  {
    id: 'case-3-unstable-cancellation-low-pm',
    title: 'Initially unstable plant with pole-zero cancellation and low PM',
    payload: {
      system: { type: 'transfer_function', num: [1, 1], den: [1, 3, -6, -8] },
      controller: { type: 'pid', Kp: 10, Ki: 0, Kd: 0, N: 100 },
      simulation: { mode: 'closed_loop', inputWaveform: 'step', duration: 12, sampleCount: 1200, amplitude: 1 },
    },
    expected: {
      plant: {
        num: [1, 1],
        den: [1, 3, -6, -8],
        poles: [{ re: 2, im: 0 }, { re: -1, im: 0 }, { re: -4, im: 0 }],
        zeros: [{ re: -1, im: 0 }],
        stable: false,
      },
      closedLoop: {
        unreducedNum: [10, 1010, 1000],
        unreducedDen: [1, 103, 304, 402, 200],
        reducedNum: [10, 10],
        reducedDen: [1, 3, 4, 2],
        filterCancellation: [1, 100],
        stable: true,
      },
      response: { finalValue: 5, tolerance: 0.001 },
      margins: { phaseMargin: 15.000630277515455, tolerance: 1e-6 },
      cli: {
        plantFormula: '(s +1) / (s^3 +3s^2 -6s -8)',
        closedLoopFormula: '(10s^2 +1010s +1000) / (s^4 +103s^3 +304s^2 +402s +200)',
      },
    },
  },
  {
    id: 'case-4-non-minimum-phase-zero',
    title: 'Non-minimum phase zero with stable poles',
    payload: {
      system: { type: 'transfer_function', num: [-1, 1], den: [1, 3, 2] },
      controller: { type: 'pid', Kp: 1, Ki: 0, Kd: 0, N: 100 },
      simulation: { mode: 'closed_loop', inputWaveform: 'step', duration: 8, sampleCount: 1000, amplitude: 1 },
    },
    expected: {
      plant: {
        num: [-1, 1],
        den: [1, 3, 2],
        poles: [{ re: -1, im: 0 }, { re: -2, im: 0 }],
        zeros: [{ re: 1, im: 0 }],
        stable: true,
      },
      closedLoop: {
        reducedNum: [-1, 1],
        reducedDen: [1, 2, 3],
        filterCancellation: [1, 100],
        poles: [{ re: -1, im: Math.sqrt(2) }, { re: -1, im: -Math.sqrt(2) }],
        stable: true,
      },
      response: { finalValue: 1 / 3, tolerance: 0.003, inverseResponseBelow: -0.01 },
      cli: {
        plantFormula: '(-s +1) / (s^2 +3s +2)',
        closedLoopFormula: '(-s^2 -99s +100) / (s^3 +102s^2 +203s +300)',
      },
    },
  },
  {
    id: 'case-5-state-space-equivalence',
    title: 'State-space to transfer function equivalence',
    payload: {
      system: {
        type: 'state_space',
        A: [[0, 1], [-2, -3]],
        B: [[0], [1]],
        C: [[1, 0]],
        D: [[0]],
      },
      simulation: { mode: 'open_loop', inputWaveform: 'step', duration: 10, sampleCount: 1000, amplitude: 1 },
    },
    expected: {
      plant: { num: [1], den: [1, 3, 2], poles: [{ re: -1, im: 0 }, { re: -2, im: 0 }], stable: true, dcGain: 0.5 },
      stateSpace: { controllabilityRank: 2, observabilityRank: 2 },
      response: { finalValue: 0.5, tolerance: 0.002 },
      cli: { plantFormula: '(1) / (s^2 +3s +2)', closedLoopFormula: '(1) / (s^2 +3s +2)' },
    },
  },
];

