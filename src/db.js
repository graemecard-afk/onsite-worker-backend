import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  console.warn("⚠️  DATABASE_URL not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log("db query", { text, duration, rows: res.rowCount });
  return res;
}
