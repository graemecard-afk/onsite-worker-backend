import { query, pool } from "./db.js";

const SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id TEXT NOT NULL,
  worker_email TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS breadcrumbs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION NULL
);

CREATE INDEX IF NOT EXISTS idx_breadcrumbs_shift_at ON breadcrumbs(shift_id, at);
`;

async function main() {
  try {
    console.log("⏳ applying schema...");
    await query(SQL);
    console.log("✅ schema applied");
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error("❌ schema apply failed:", err);
  process.exit(1);
});
