import { sql } from '@vercel/postgres'
import { ensureCoreTables } from '../utils/db.js'
import { requireAdminSecret } from '../utils/auth.js'

export default defineEventHandler(async (event) => {
  try {
    requireAdminSecret(event)
    await ensureCoreTables()

    // Clear both tables
    await sql`TRUNCATE TABLE lottery_winners`
    await sql`TRUNCATE TABLE token_holders`
    
    // Inspect table schemas
    const tableCheck = await sql`SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name = 'token_holders' ORDER BY ordinal_position`
    const winnersTableCheck = await sql`SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name = 'lottery_winners' ORDER BY ordinal_position`
    
    return {
      success: true,
      message: 'Database tables are ready',
      tables: {
        tokenHolders: {
          name: 'token_holders',
          columns: tableCheck.rows,
          currentRecords: 0
        },
        lotteryWinners: {
          name: 'lottery_winners',
          columns: winnersTableCheck.rows,
          currentRecords: 0
        }
      }
    }
    
  } catch (error) {
    console.error('Database init error:', error)
    
    // Surface the error via createError for consistent handling
    throw createError({
      statusCode: 500,
      statusMessage: 'Database operation failed',
      data: {
        success: false,
        message: 'Database operation failed',
        error: error.message || String(error)
      }
    })
  }
})
