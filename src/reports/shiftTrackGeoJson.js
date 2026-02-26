// src/reports/shiftTrackGeoJson.js
// Builds an admin GeoJSON export for a single shift (LineString + Points)

export async function buildShiftTrackGeoJson({ query, shiftId }) {
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

  const breadcrumbs = bcResult.rows || [];

  // Build ordered coordinates for the line. GeoJSON uses [lng, lat].
  const lineCoords = [];
  for (const b of breadcrumbs) {
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      lineCoords.push([lng, lat]);
    }
  }

  const features = [];

  // LineString feature (only if we have at least 2 points)
  if (lineCoords.length >= 2) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: lineCoords,
      },
      properties: {
        feature_type: "track_line",
        shift_id: shift.id,
        site_id: shift.site_id,
        worker_email: shift.worker_email,
        started_at: shift.started_at,
        ended_at: shift.ended_at,
        points_in_line: lineCoords.length,
      },
    });
  }

  // Point features (one per breadcrumb), include seq for ordering
  let seq = 0;
  for (const b of breadcrumbs) {
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lng, lat],
      },
      properties: {
        feature_type: "breadcrumb_point",
        breadcrumb_id: b.id,
        seq,
        shift_id: shift.id,
        site_id: shift.site_id,
        worker_email: shift.worker_email,
        at: b.at,
        accuracy_m: b.accuracy_m,
      },
    });

    seq += 1;
  }

  return {
    shiftId: shift.id,
    geojson: {
      type: "FeatureCollection",
      features,
    },
    meta: {
      shift: {
        id: shift.id,
        site_id: shift.site_id,
        worker_email: shift.worker_email,
        started_at: shift.started_at,
        ended_at: shift.ended_at,
      },
      breadcrumbs_total: breadcrumbs.length,
      points_emitted: seq,
      line_emitted: lineCoords.length >= 2,
    },
  };
}