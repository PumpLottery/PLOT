import { sql } from '@vercel/postgres'

export default defineEventHandler(async (event) => {
  try {
    // Verify required environment variables
    if (!process.env.POSTGRES_URL) {
      throw new Error('POSTGRES_URL environment variable is not set')
    }
    
    // Run a simple test query
    const result = await sql`SELECT NOW() as current_time, version() as db_version`
    
    return {
      success: true,
      message: 'Database connection succeeded',
      data: result.rows[0],
      connection: {
        database: 'neondb',
        note: 'Connected via @vercel/postgres'
      }
    }
  } catch (error) {
    console.error('Database test error:', error)
    
    // Surface the error via createError for proper handling
    throw createError({
      statusCode: 500,
      statusMessage: 'Database connection failed',
      data: {
        success: false,
        message: 'Database connection failed',
        error: error.message || String(error),
        hasPostgresUrl: !!process.env.POSTGRES_URL
      }
    })
  }
})
