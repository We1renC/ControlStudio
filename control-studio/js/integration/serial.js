/**
 * serial.js - Tier J2: Web Serial protocol codecs.
 */

export function encodeSerial(payload, protocol = 'csv') {
  if (protocol === 'binary') return new Uint8Array(payload.map((v) => Math.max(0, Math.min(255, Math.round(v)))));
  if (protocol === 'modbus-rtu') return new Uint8Array([payload.slaveId ?? 1, payload.functionCode ?? 3, payload.addr ?? 0, payload.count ?? 1]);
  return `${payload.join(',')}\n`;
}

export function decodeSerial(data, protocol = 'csv') {
  if (protocol === 'binary') return Array.from(data);
  if (protocol === 'modbus-rtu') return { slaveId: data[0], functionCode: data[1], addr: data[2], count: data[3] };
  return String(data).trim().split(',').filter(Boolean).map(Number);
}

export function connectSerial({ baud = 115200, protocol = 'csv', port = null } = {}) {
  return { baud, protocol, port, encode: (payload) => encodeSerial(payload, protocol), decode: (data) => decodeSerial(data, protocol) };
}

export default { connectSerial, encodeSerial, decodeSerial };
