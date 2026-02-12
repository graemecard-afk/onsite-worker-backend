import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool, query } from "./db.js";

dotenv.config();

const app = express();

app.use(express.json());

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow curl / server-to-server

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
  })
);


// -----------------------
// Health
// -----------------------
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "onsite-worker-backend" });
});

// -----------------------
// Shifts
// -----------------------
app.post("/shifts/start", async (req, res) => {
  try {
    const { siteId, workerEmail } = req.body || {};

    if (!siteId || !workerEmail) {
      return res.status(400).json({ error: "Missing siteId or workerEmail" });
    }

    const result = await query(
      `INSERT INTO shifts (site_id, worker_email)
       VALUES ($1, $2)
       RETURNING id, site_id, worker_email, started_at`,
      [String(siteId), String(workerEmail).trim().toLowerCase()]
    );

    return res.json({ shift: result.rows[0] });
  } catch (err) {
    console.error("POST /shifts/start failed", err);
    return res.status(500).json({ error: "Server error" });
  }
});
// POST /shifts/end
// Ends a shift by setting ended_at = now()
app.post("/shifts/end", async (req, res) => {
  try {
    const { shiftId } = req.body || {};

    if (!shiftId) {
      return res.status(400).json({ error: "Missing shiftId" });
    }

    const result = await query(
      `UPDATE shifts
       SET ended_at = NOW()
       WHERE id = $1
       RETURNING id, ended_at`,
      [String(shiftId)]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Shift not found" });
    }

    return res.json({ ok: true, shift: result.rows[0] });
  } catch (err) {
    console.error("POST /shifts/end failed", err);
    return res.status(500).json({ error: "Server error" });
  }
});


// GET /shifts/active?siteId=STRING
// Returns active (not ended) shifts for a site
app.get("/shifts/active", async (req, res) => {
  try {
    const token = req.headers["x-api-token"];
    const expectedToken = process.env.SUPERVISOR_TOKEN;

    if (!expectedToken || token !== expectedToken) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { siteId } = req.query;

    if (!siteId) {
      return res.status(400).json({ error: "Missing siteId" });
    }

    const result = await query(
      `SELECT id, site_id, worker_email, started_at
       FROM shifts
       WHERE site_id = $1
         AND ended_at IS NULL
       ORDER BY started_at DESC`,
      [String(siteId)]
    );

    return res.json({ shifts: result.rows });
  } catch (err) {
    console.error("GET /shifts/active failed", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /breadcrumbs?shiftId=UUID
// Returns all breadcrumbs for a shift, ordered by time asc
app.get("/breadcrumbs", async (req, res) => {
  try {
    const { shiftId } = req.query;

    if (!shiftId) {
      return res.status(400).json({ error: "Missing shiftId" });
    }

    const result = await query(
      `
      SELECT id, shift_id, at, lat, lng, accuracy_m
      FROM breadcrumbs
      WHERE shift_id = $1
      ORDER BY at ASC
      `,
      [shiftId]
    );

    return res.json({ breadcrumbs: result.rows });
  } catch (err) {
    console.error("GET /breadcrumbs failed:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// -----------------------
// Breadcrumbs
// -----------------------
app.post("/breadcrumbs", async (req, res) => {
  try {
    const { shiftId, at, lat, lng, accuracyM } = req.body || {};

    if (!shiftId || !at || lat == null || lng == null) {
      return res.status(400).json({ error: "Missing shiftId, at, lat, or lng" });
    }

    const result = await query(
      `INSERT INTO breadcrumbs (shift_id, at, lat, lng, accuracy_m)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [shiftId, new Date(at), lat, lng, accuracyM ?? null]
    );

    return res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    console.error("POST /breadcrumbs failed", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// -----------------------
// Startup DB check
// -----------------------
pool
  .query("select 1")
  .then(() => console.log("✅ database connected"))
  .catch(err => console.error("❌ database connection failed", err.message));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ API listening on ${port}`);
});
