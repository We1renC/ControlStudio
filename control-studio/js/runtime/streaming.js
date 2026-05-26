/**
 * streaming.js - Tier I4: chunked computation helpers for progressive rendering.
 */

export function streamChunks(data, chunkSize = 1000, onChunk = () => {}) {
  const chunks = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    chunks.push(chunk);
    onChunk(chunk, { start: i, end: Math.min(data.length, i + chunkSize), done: i + chunkSize >= data.length });
  }
  return chunks;
}

export function progressiveMap(data, mapper, chunkSize = 1000) {
  const out = [];
  streamChunks(data, chunkSize, (chunk, meta) => {
    for (let i = 0; i < chunk.length; i++) out[meta.start + i] = mapper(chunk[i], meta.start + i);
  });
  return out;
}

export default { streamChunks, progressiveMap };
