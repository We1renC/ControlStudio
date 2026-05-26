#!/usr/bin/env node
/**
 * Verification for Functional Roadmap Tier H/I/J baselines.
 */

import { generateC, generateCMake } from '../js/codegen/c_generator.js';
import { generateRust } from '../js/codegen/rust_generator.js';
import { generateST } from '../js/codegen/plc_generator.js';
import { generateAUTOSAR } from '../js/codegen/autosar_generator.js';
import { generateFreeRTOS } from '../js/codegen/freertos_generator.js';
import { wrapWithSafety } from '../js/codegen/safety_wrapper.js';
import { createWasmAdapter, flattenFloat64 } from '../js/wasm/loader.js';
import { createComputeWorker } from '../js/workers/compute_worker.js';
import { memoize } from '../js/runtime/memoization.js';
import { progressiveMap, streamChunks } from '../js/runtime/streaming.js';
import { crossCheck } from '../js/runtime/cross_method.js';
import { connectHIL, makeHilFrame } from '../js/integration/hil_ws.js';
import { connectSerial } from '../js/integration/serial.js';
import { connectOPCUA } from '../js/integration/opcua.js';
import { connectModbus } from '../js/integration/modbus.js';
import { mqttConnect } from '../js/integration/mqtt.js';
import { normalizeTimeSeries, queryInfluxDB, queryPrometheus } from '../js/integration/timeseries.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function verifyH() {
  const c = generateC({ controller: { kp: 2, ki: 0.5, kd: 0.1 }, dt: 0.01, options: { fixedPoint: true, qFormat: 'Q15', isr: true, cmsis: true } });
  assert(c.files['controller.h'].includes('CS_PID') && c.files['controller.c'].includes('CS_FIXED_POINT_Q15'), 'H1 C codegen missing PID or fixed-point output');
  assert(generateCMake().includes('add_library'), 'H1 CMake template missing library target');
  const rust = generateRust({ controller: { kp: 1 }, noStd: true });
  assert(rust['src/controller.rs'].includes('#![no_std]') && rust['Cargo.toml'].includes('edition = "2021"'), 'H2 Rust no_std template invalid');
  assert(generateST({ controller: { kp: 1 } }).includes('FUNCTION_BLOCK'), 'H3 Structured Text template invalid');
  assert(generateAUTOSAR({ swc_name: 'CS_SWC' })['controller.arxml'].includes('CS_SWC'), 'H4 AUTOSAR ARXML missing SWC name');
  assert(generateFreeRTOS({ period_ms: 5 }).includes('xTaskCreate'), 'H5 FreeRTOS task missing xTaskCreate');
  const wrapped = wrapWithSafety(c.files['controller.c'], { crc: true, watchdog: true, redundancy: 2 });
  assert(wrapped.code.includes('CS_CODE_CRC') && wrapped.code.includes('cs_watchdog_kick') && wrapped.redundancy === 2, 'H6 safety wrapper missing CRC/watchdog/redundancy');
}

async function verifyI() {
  const wasm = createWasmAdapter({ fallback: { twice: ({ x }) => 2 * x } });
  const cmp = wasm.compare('twice', { x: 3 }, ({ x }) => x + x);
  assert(cmp.pass && flattenFloat64([[1, 2], [3, 4]]).length === 4, 'I1 WASM adapter comparison failed');

  const worker = createComputeWorker({ square: ({ x }) => x * x });
  const wr = await worker.run('square', { x: 5 });
  assert(wr.result === 25, 'I2 worker facade failed');

  let calls = 0;
  const f = memoize((x) => { calls++; return x * 2; }, (x) => String(x), 2);
  assert(f(2) === 4 && f(2) === 4 && calls === 1 && f.stats.hits === 1, 'I3 memoization cache failed');

  const chunks = streamChunks([1, 2, 3, 4, 5], 2);
  const mapped = progressiveMap([1, 2, 3], (x) => x * x, 2);
  assert(chunks.length === 3 && mapped.join(',') === '1,4,9', 'I4 streaming/progressive map failed');

  const table = crossCheck('scalar', [
    { name: 'a', solve: (p) => p.x * 2 },
    { name: 'b', solve: (p) => p.x + p.x },
  ], [{ name: 'one', x: 2 }]);
  assert(table.pass && table.rows[0].maxDiff === 0, 'I5 cross-method check failed');
}

function verifyJ() {
  const sent = [];
  const hil = connectHIL({ transport: { send: (frame) => sent.push(frame) } });
  let received = null;
  hil.onState((state) => { received = state; });
  hil.receive(makeHilFrame({ state: [1], time: 0.001 }));
  hil.sendControl([0.5], 0.002);
  assert(received.state[0] === 1 && sent[0].includes('"control"'), 'J1 HIL bridge protocol failed');

  const csv = connectSerial({ protocol: 'csv' });
  const bin = connectSerial({ protocol: 'binary' });
  const rtu = connectSerial({ protocol: 'modbus-rtu' });
  assert(csv.decode(csv.encode([1, 2, 3])).length === 3, 'J2 serial CSV codec failed');
  assert(bin.decode(bin.encode([1, 2, 300]))[2] === 255, 'J2 serial binary codec failed');
  assert(rtu.decode(rtu.encode({ slaveId: 2, functionCode: 3, addr: 10, count: 4 })).slaveId === 2, 'J2 serial Modbus RTU codec failed');

  const opc = connectOPCUA({ endpoint: 'opc.tcp://localhost:4840' });
  assert(opc.readValue('ns=1;s=x').op === 'read' && opc.writeValue('ns=1;s=x', 2).value === 2, 'J3 OPC UA request helper failed');
  const mb = connectModbus({ host: 'plc.local', slaveId: 7 });
  assert(mb.readHoldingRegisters(100, 2).functionCode === 3 && mb.writeCoil(1, true).functionCode === 5, 'J4 Modbus helper failed');

  let mqttSeen = null;
  const mqtt = mqttConnect({});
  mqtt.subscribe('plant/sensor/+', (payload) => { mqttSeen = payload; });
  mqtt.publish('plant/sensor/temp', { y: 42 });
  assert(mqttSeen.y === 42, 'J5 MQTT routing failed');

  assert(queryInfluxDB({ url: 'http://db', query: 'from(bucket:"x")' }).method === 'POST', 'J6 Influx query builder failed');
  assert(queryPrometheus({ url: 'http://prom', metric: 'plant_y' }).url.includes('/api/v1/query_range'), 'J6 Prometheus query builder failed');
  assert(normalizeTimeSeries([{ t: 1, y: 2 }, [3, 4]]).y[1] === 4, 'J6 time-series normalizer failed');
}

await verifyH();
await verifyI();
verifyJ();

console.log('PASS: H/I/J deployment-runtime-integration verification');
