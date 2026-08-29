const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// roda no boot; cria o que falta e nao mexe no que ja existe
async function migrar() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS professores (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      nome TEXT NOT NULL,
      senha_hash TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

module.exports = { pool, migrar };
