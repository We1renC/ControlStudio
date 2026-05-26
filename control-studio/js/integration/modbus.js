/**
 * modbus.js - Tier J4: Modbus TCP/RTU client request helpers.
 */

export function connectModbus({ type = 'tcp', host = '127.0.0.1', port = 502, slaveId = 1, transport = null } = {}) {
  function request(functionCode, address, valueOrCount) {
    const frame = { type, host, port, slaveId, functionCode, address, valueOrCount };
    return transport?.request ? transport.request(frame) : frame;
  }
  return {
    readHoldingRegisters: (addr, count) => request(3, addr, count),
    writeCoil: (addr, val) => request(5, addr, !!val),
  };
}

export default { connectModbus };
