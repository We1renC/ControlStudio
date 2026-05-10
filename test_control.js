import { TransferFunction } from './control-studio/js/control/transfer-function.js';
import { impulseResponse, rampResponse, stepResponse } from './control-studio/js/analysis/time-response.js';
import { nyquistData } from './control-studio/js/analysis/frequency-response.js';
import { stateSpaceToTransferFunction } from './control-studio/js/control/state-space.js';
import { stepInfo, stabilityMargins } from './control-studio/js/control/stability.js';
import { parsePolyString } from './control-studio/js/utils/format.js';

try {
  // Test 1/(s+1)
  const num1 = parsePolyString('1');
  const den1 = parsePolyString('1, 1');
  const sys1 = new TransferFunction(num1, den1);
  const resp1 = stepResponse(sys1);
  const info1 = stepInfo(resp1.t, resp1.y);
  console.log('1/(s+1) Rise Time:', info1.riseTime);
  console.log('1/(s+1) Settling Time:', info1.settlingTime);
  console.log('1/(s+1) Poles:', sys1.poles().map(p => ({re: p.re, im: p.im})));

  // Test 1/(s-1)
  const num2 = parsePolyString('1');
  const den2 = parsePolyString('1, -1');
  const sys2 = new TransferFunction(num2, den2);
  const resp2 = stepResponse(sys2);
  console.log('1/(s-1) Poles:', sys2.poles().map(p => ({re: p.re, im: p.im})));

  // Check STABILITY logic
  const checkStability = (targetSys) => {
    if (!targetSys) return 'unknown';
    const poles = targetSys.poles();
    if (poles.some(p => p.re > 1e-7)) return 'unstable';
    if (poles.some(p => Math.abs(p.re) < 1e-7)) return 'marginal';
    return 'stable';
  };

  console.log('1/(s+1) Status:', checkStability(sys1));
  console.log('1/(s-1) Status:', checkStability(sys2));

  const ssTf = stateSpaceToTransferFunction(
    [[0, 1], [-2, -3]],
    [[0], [1]],
    [[1, 0]],
    [[0]]
  );
  console.log('State Space TF:', ssTf.toString());

  const imp = impulseResponse(sys1);
  const ramp = rampResponse(sys1);
  const nyq = nyquistData(sys1);
  console.log('Impulse samples:', imp.y.slice(0, 3));
  console.log('Ramp final sample:', ramp.y[ramp.y.length - 1]);
  console.log('Nyquist first point:', { re: nyq.re[0], im: nyq.im[0] });

  console.log('Tests Passed!');
} catch (e) {
  console.error('Error:', e);
}
