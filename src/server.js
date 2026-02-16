import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool, query } from "./db.js";

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET in environment");
  process.exit(1);
}


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
// Auth
// -----------------------
app.post("/auth/register", async (req, res) => {
  try {
    const { email, password, role } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const passwordHash = await bcrypt.hash(String(password), 10);
    const userRole = role === "admin" ? "admin" : "worker";

    const result = await query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, role, is_active, created_at`,
      [normalizedEmail, passwordHash, userRole]
    );

    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    // unique violation on email
    if (String(err?.code) === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }
    console.error("POST /auth/register failed", err);
    res.status(500).json({ error: "Server error" });
  }
});
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const result = await query(
      `SELECT id, email, password_hash, role, is_active
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );

    const user = result.rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(String(password), String(user.password_hash));
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({ ok: true, token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    console.error("POST /auth/login failed", err);
    res.status(500).json({ error: "Server error" });
  }
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

// GET /shifts/status?shiftId=UUID&workerEmail=email
// Used by worker app to verify shift is still active
app.get("/shifts/status", async (req, res) => {
  try {
    const { shiftId, workerEmail } = req.query;

    if (!shiftId || !workerEmail) {
      return res.status(400).json({ error: "Missing shiftId or workerEmail" });
    }

    const result = await query(
      `SELECT id, site_id, worker_email, started_at, ended_at
       FROM shifts
       WHERE id = $1`,
      [String(shiftId)]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Shift not found" });
    }

    const shift = result.rows[0];

    if (shift.worker_email !== String(workerEmail).trim().toLowerCase()) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return res.json({ shift });
  } catch (err) {
    console.error("GET /shifts/status failed", err);
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
// GET /debug/shift?id=UUID  (TEMP - remove after diagnosis)
app.get("/debug/shift", async (req, res) => {
  try {
    const token = req.headers["x-api-token"];
    const expectedToken = process.env.SUPERVISOR_TOKEN;

    if (!expectedToken || token !== expectedToken) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: "Missing id" });
    }

    const result = await query(
      `SELECT id, site_id, worker_email, started_at, ended_at
       FROM shifts
       WHERE id = $1`,
      [String(id)]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    return res.json({ shift: result.rows[0] });
  } catch (err) {
    console.error("GET /debug/shift failed", err);
    return res.status(500).json({ error: "Server error" });
  }
});


// POST /shifts/end-all
// Ends all active shifts for a site (supervisor token required)
app.post("/shifts/end-all", async (req, res) => {
  try {
    const token = req.headers["x-api-token"];
    const expectedToken = process.env.SUPERVISOR_TOKEN;

    if (!expectedToken || token !== expectedToken) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { siteId } = req.body || {};
    if (!siteId) {
      return res.status(400).json({ error: "Missing siteId" });
    }

    const result = await query(
      `UPDATE shifts
       SET ended_at = NOW()
       WHERE site_id = $1
         AND ended_at IS NULL`,
      [String(siteId)]
    );

    return res.json({ ok: true, ended: result.rowCount });
  } catch (err) {
    console.error("POST /shifts/end-all failed", err);
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
