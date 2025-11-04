import { sql } from '@vercel/postgres'
import { parseDbTimestamp } from '../../utils/time.js'

export default defineEventHandler(async (event) => {
  try {
    // Read pagination parameters
    const query = getQuery(event)
    const page = parseInt(query.page) || 1
    const limit = parseInt(query.limit) || 50
    const offset = (page - 1) * limit
    
    // Count total holders
    const countResult = await sql`SELECT COUNT(*) as total FROM token_holders`
    const total = parseInt(countResult.rows[0].total)
    
    // Fetch paginated data plus last-updated timestamp
    const holdersPromise = sql`
      SELECT 
        wallet_address,
        balance,
        balance_ui,
        rank,
        updated_at
      FROM token_holders
      ORDER BY rank ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `

    const lastUpdatedPromise = sql`
      SELECT MAX(updated_at) AS latest_update FROM token_holders
    `

    const [holders, lastUpdatedRow] = await Promise.all([holdersPromise, lastUpdatedPromise])
    const lastUpdatedDate = parseDbTimestamp(lastUpdatedRow.rows[0]?.latest_update)
    const lastUpdated = lastUpdatedDate ? lastUpdatedDate.toISOString() : null

    const holdersData = holders.rows.map((row) => ({
      ...row,
      updated_at: parseDbTimestamp(row.updated_at)?.toISOString() || null
    }))
    
    return {
      success: true,
      data: holdersData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      lastUpdated
    }
    
  } catch (error) {
    console.error('Failed to fetch holder list:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch holder list',
      data: {
        success: false,
        error: error.message
      }
    })
  }
})
