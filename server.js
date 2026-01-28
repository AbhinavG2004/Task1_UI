import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const pool = mysql.createPool({
  host: requiredEnv("DB_HOST"),
  port: Number(process.env.DB_PORT || 3306),
  user: requiredEnv("DB_USER"),
  password: requiredEnv("DB_PASSWORD"),
  database: requiredEnv("DB_NAME"), // must already exist
  waitForConnections: true,
  connectionLimit: 10,
});

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS servers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      server_name VARCHAR(120) NOT NULL,
      ip VARCHAR(45) NOT NULL,
      purpose VARCHAR(255) NOT NULL,
      os VARCHAR(80) NOT NULL,
      status VARCHAR(40) NOT NULL,
      allocated_date DATE NOT NULL,
      surrendered_date DATE NULL,
      category VARCHAR(40) NOT NULL,
      owner VARCHAR(120) NOT NULL,
      backup_type VARCHAR(40) NOT NULL,
      backup_frequency VARCHAR(40) NOT NULL,
      remarks VARCHAR(255) NULL,
      additional_remarks TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_server_name (server_name)
    );
  `);
}

app.get("/api/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, db: rows?.[0]?.ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/servers", async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT
      server_name AS serverName,
      ip,
      purpose,
      os,
      status,
      DATE_FORMAT(allocated_date,'%Y-%m-%d') AS allocatedDate,
      IFNULL(DATE_FORMAT(surrendered_date,'%Y-%m-%d'),'') AS surrenderedDate,
      category,
      owner,
      backup_type AS backupType,
      backup_frequency AS backupFrequency,
      IFNULL(remarks,'') AS remarks,
      IFNULL(additional_remarks,'') AS additionalRemarks
    FROM servers
    ORDER BY server_name ASC`
  );
  res.json(rows);
});

app.post("/api/servers", async (req, res) => {
  const s = req.body;
  if (!s?.serverName || !s?.ip || !s?.purpose || !s?.owner || !s?.allocatedDate) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  const sql = `
    INSERT INTO servers
      (server_name, ip, purpose, os, status, allocated_date, surrendered_date, category, owner,
       backup_type, backup_frequency, remarks, additional_remarks)
    VALUES
      (?, ?, ?, ?, ?, ?, NULLIF(?, ''), ?, ?, ?, ?, NULLIF(?, ''), NULLIF(?, ''))
    ON DUPLICATE KEY UPDATE
      ip = VALUES(ip),
      purpose = VALUES(purpose),
      os = VALUES(os),
      status = VALUES(status),
      allocated_date = VALUES(allocated_date),
      surrendered_date = VALUES(surrendered_date),
      category = VALUES(category),
      owner = VALUES(owner),
      backup_type = VALUES(backup_type),
      backup_frequency = VALUES(backup_frequency),
      remarks = VALUES(remarks),
      additional_remarks = VALUES(additional_remarks)
  `;

  try {
    await pool.execute(sql, [
      s.serverName,
      s.ip,
      s.purpose,
      s.os,
      s.status,
      s.allocatedDate,
      s.surrenderedDate || "",
      s.category,
      s.owner,
      s.backupType,
      s.backupFrequency,
      s.remarks || "",
      s.additionalRemarks || "",
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "DB error", detail: String(e?.message || e) });
  }
});

app.delete("/api/servers", async (_req, res) => {
  await pool.query("DELETE FROM servers");
  res.json({ ok: true });
});

async function start() {
  await ensureTables();
  const port = Number(process.env.PORT || 5000);
  app.listen(port, () => console.log(`Backend running on http://localhost:${port}`));
}

start().catch((e) => {
  console.error("Startup failed:", e?.message || e);
  process.exit(1);
});
