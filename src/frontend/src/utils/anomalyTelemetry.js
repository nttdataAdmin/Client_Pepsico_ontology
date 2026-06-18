/**
 * Normalize API/CSV anomaly rows for charts that group by clock time (HH:MM).
 * @param {Array<Record<string, unknown>>} rows
 * @returns {Array<Record<string, unknown>>}
 */
export function normalizeAnomalyRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const raw = row.time;
    let time = raw;
    if (typeof raw === 'string') {
      if (raw.includes('T')) {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) {
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          time = `${hh}:${mm}`;
        }
      } else if (raw.includes(' ')) {
        const part = raw.split(' ')[1] || raw;
        time = part.length >= 5 ? part.slice(0, 5) : part;
      }
    }
    const v = row.vibration;
    const t = row.temperature;
    return {
      ...row,
      time,
      vibration: v != null && v !== '' ? parseFloat(v) : v,
      temperature: t != null && t !== '' ? parseFloat(t) : t,
    };
  });
}
