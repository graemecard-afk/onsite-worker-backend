import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db.js";
import { query } from "./db.js";



dotenv.config();

const app = express();

app.use(express.json());

const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: corsOrigin }));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "onsite-worker-backend" });
});
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

pool
  .query("select 1")
  .then(() => console.log("✅ database connected"))
  .catch(err => console.error("❌ database connection failed", err.message));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ API listening on ${port}`);
});
