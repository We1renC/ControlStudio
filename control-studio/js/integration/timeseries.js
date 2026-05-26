/**
 * timeseries.js - Tier J6: TSDB query builders and normalizers.
 */

export function queryInfluxDB({ url, query, time_range = '-1h' } = {}) {
  return { url, method: 'POST', body: { query, time_range } };
}

export function queryPrometheus({ url, metric, range = '1h', step = '1s' } = {}) {
  const endpoint = `${url.replace(/\/$/, '')}/api/v1/query_range`;
  return { url: endpoint, params: { query: metric, range, step } };
}

export function normalizeTimeSeries(rows) {
  return {
    t: rows.map((row) => Number(row.t ?? row.time ?? row[0])),
    y: rows.map((row) => Number(row.y ?? row.value ?? row[1])),
  };
}

export default { queryInfluxDB, queryPrometheus, normalizeTimeSeries };
