/**
 * safety_wrapper.js - Tier H6: CRC and watchdog code wrapping.
 */

export function crc32(text) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i);
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export function wrapWithSafety(code, { crc = true, watchdog = true, redundancy = 1 } = {}) {
  const checksum = crc ? crc32(code).toString(16).padStart(8, '0') : null;
  const prefix = [
    '/* ControlStudio safety wrapper */',
    crc ? `#define CS_CODE_CRC 0x${checksum}u` : '',
    watchdog ? 'extern void cs_watchdog_kick(void);' : '',
    redundancy > 1 ? `#define CS_REDUNDANCY (${redundancy})` : '',
  ].filter(Boolean).join('\n');
  const suffix = watchdog ? '\n/* watchdog hook: call cs_watchdog_kick() after each successful controller step */\n' : '\n';
  return { code: `${prefix}\n${code}${suffix}`, crc: checksum, watchdog, redundancy };
}

export default { crc32, wrapWithSafety };
