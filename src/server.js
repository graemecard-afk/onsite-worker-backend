import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json());

const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: corsOrigin }));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "onsite-worker-backend" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ API listening on ${port}`);
});
