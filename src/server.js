import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db.js";


dotenv.config();

const app = express();

app.use(express.json());

const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: corsOrigin }));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "onsite-worker-backend" });
});
pool
  .query("select 1")
  .then(() => console.log("✅ database connected"))
  .catch(err => console.error("❌ database connection failed", err.message));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ API listening on ${port}`);
});
