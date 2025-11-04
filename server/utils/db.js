import { sql } from '@vercel/postgres'

export async function ensureTokenHoldersTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS token_holders (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(44) UNIQUE NOT NULL,
      balance BIGINT NOT NULL,
      balance_ui DECIMAL(20, 9),
      rank INTEGER,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS idx_wallet_address ON token_holders(wallet_address)`
  await sql`CREATE INDEX IF NOT EXISTS idx_balance ON token_holders(balance DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_rank ON token_holders(rank)`
  await sql`ALTER TABLE token_holders DROP COLUMN IF EXISTS percentage`
}

export async function ensureLotteryWinnersTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS lottery_winners (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(44) NOT NULL,
      amount_lamports BIGINT NOT NULL,
      amount_sol DECIMAL(20, 9),
      tx_signature VARCHAR(128),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS idx_lottery_wallet ON lottery_winners(wallet_address)`
  await sql`CREATE INDEX IF NOT EXISTS idx_lottery_time ON lottery_winners(created_at DESC)`
}

export async function ensureCoreTables() {
  await ensureTokenHoldersTable()
  await ensureLotteryWinnersTable()
}
