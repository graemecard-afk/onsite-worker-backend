// src/reports/shiftReportCsv.js
// Builds an admin CSV export for a single shift (summary + breadcrumbs)

export async function buildShiftReportCsv({ query, shiftId }) {
  if (!shiftId) {
    const err = new Error("Missing shiftId");
    err.statusCode = 400;
    throw err;
  }

  const shiftResult = await query(
    `SELECT id, site_id, worker_email, started_at, ended_at
     FROM shifts
     WHERE id = $1`,
    [String(shiftId)]
  );

  if (shiftResult.rowCount === 0) {
    const err = new Error("Shift not found");
    err.statusCode = 404;
    throw err;
  }

  const shift = shiftResult.rows[0];

  const bcResult = await query(
    `SELECT id, shift_id, at, lat, lng, accuracy_m
     FROM breadcrumbs
     WHERE shift_id = $1
     ORDER BY at ASC`,
    [String(shiftId)]
  );

  const escapeCsv = v => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const startedAt = shift.started_at ? new Date(shift.started_at) : null;
  const endedAt = shift.ended_at ? new Date(shift.ended_at) : null;
  const durationMinutes =
    startedAt && endedAt ? Math.max(0, Math.round((endedAt - startedAt) / 60000)) : "";

  const lines = [];
  lines.push("section,key,value");

  const summaryRows = [
    ["shift_summary", "shift_id", shift.id],
    ["shift_summary", "site_id", shift.site_id],
    ["shift_summary", "worker_email", shift.worker_email],
    ["shift_summary", "started_at", shift.started_at],
    ["shift_summary", "ended_at", shift.ended_at],
    ["shift_summary", "duration_minutes", durationMinutes],
    ["shift_summary", "breadcrumbs_count", bcResult.rowCount],
  ];

  for (const r of summaryRows) lines.push(r.map(escapeCsv).join(","));

  lines.push("");
  lines.push("section,id,shift_id,at,lat,lng,accuracy_m");

  for (const b of bcResult.rows) {
    lines.push(
      ["breadcrumbs", b.id, b.shift_id, b.at, b.lat, b.lng, b.accuracy_m]
        .map(escapeCsv)
        .join(",")
    );
  }

  return { shiftId: shift.id, csv: lines.join("\n") };
}
