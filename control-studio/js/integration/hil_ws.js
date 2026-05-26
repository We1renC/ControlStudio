/**
 * hil_ws.js - Tier J1: WebSocket HIL bridge protocol mock.
 */

export function makeHilFrame({ state = [], input = [], time = 0, type = 'state' } = {}) {
  return JSON.stringify({ type, state, input, time });
}

export function parseHilFrame(frame) {
  const msg = typeof frame === 'string' ? JSON.parse(frame) : frame;
  if (!msg || typeof msg !== 'object') throw new Error('invalid HIL frame');
  return { type: msg.type ?? 'state', state: msg.state ?? [], input: msg.input ?? [], time: Number(msg.time ?? 0) };
}

export function connectHIL({ transport, protocol = 'simulink' } = {}) {
  const listeners = [];
  return {
    protocol,
    onState(cb) { listeners.push(cb); },
    receive(frame) {
      const parsed = parseHilFrame(frame);
      for (const cb of listeners) cb(parsed);
      return parsed;
    },
    sendControl(u, time = 0) {
      const frame = makeHilFrame({ input: u, time, type: 'control' });
      if (transport?.send) transport.send(frame);
      return frame;
    },
  };
}

export default { connectHIL, makeHilFrame, parseHilFrame };
