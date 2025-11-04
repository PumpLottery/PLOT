import { sql } from '@vercel/postgres'
import { createHeliusConnection, getAdminKeypair, lamportsToSol, DRAW_INTERVAL_MS } from '../../utils/lottery.js'
import { ensureLotteryWinnersTable, ensureTokenHoldersTable } from '../../utils/db.js'
import { parseDbTimestamp } from '../../utils/time.js'

export default defineEventHandler(async (event) => {
  try {
    const config = useRuntimeConfig()

    if (!config.heliusApiKey) {
      throw new Error('Missing HELIUS_API_KEY configuration')
    }
    if (!config.adminSecretKey) {
      throw new Error('Missing ADMIN_SECRET_KEY configuration')
    }

    const connection = createHeliusConnection(config.heliusApiKey)
    const adminKeypair = getAdminKeypair(config.adminSecretKey)
    const adminPublicKey = adminKeypair.publicKey
    
    await Promise.all([ensureLotteryWinnersTable(), ensureTokenHoldersTable()])

    const [balanceLamports, winnersResult, lastUpdatedResult] = await Promise.all([
      connection.getBalance(adminPublicKey),
      sql`SELECT wallet_address, amount_lamports, amount_sol, tx_signature, created_at FROM lottery_winners ORDER BY created_at DESC`,
      sql`SELECT MAX(updated_at) AS last_updated FROM token_holders`
    ])

    const winners = winnersResult.rows.map((row) => {
      const parsedDate = parseDbTimestamp(row.created_at)
      return {
        walletAddress: row.wallet_address,
        amountLamports: Number(row.amount_lamports),
        amountSol: Number(row.amount_sol),
        txSignature: row.tx_signature,
        createdAt: parsedDate ? parsedDate.toISOString() : null
      }
    })

    const lastWinner = winners[0] || null
    const lastDrawTime = lastWinner?.createdAt ? new Date(lastWinner.createdAt) : null
    const lastUpdatedRaw = lastUpdatedResult.rows[0]?.last_updated
    const lastUpdated = lastUpdatedRaw ? parseDbTimestamp(lastUpdatedRaw) : null

    const referenceTime = lastDrawTime || lastUpdated
    const nowMs = Date.now()
    let nextDraw = null
    let nextDrawMs = null

    if (referenceTime) {
      const refMs = referenceTime.getTime()
      let candidateMs = refMs + DRAW_INTERVAL_MS
      if (candidateMs <= nowMs) {
        const elapsed = nowMs - refMs
        const intervalsPassed = Math.floor(elapsed / DRAW_INTERVAL_MS)
        candidateMs = refMs + (intervalsPassed + 1) * DRAW_INTERVAL_MS
      }
      nextDraw = new Date(candidateMs)
      nextDrawMs = candidateMs
    }

    const remainingMs = nextDrawMs !== null ? Math.max(nextDrawMs - nowMs, 0) : null

    return {
      success: true,
      jackpot: {
        address: adminPublicKey.toBase58(),
        balanceLamports,
        balanceSol: lamportsToSol(balanceLamports)
      },
      schedule: {
        lastDraw: lastDrawTime ? lastDrawTime.toISOString() : null,
        lastUpdate: lastUpdated ? lastUpdated.toISOString() : null,
        nextDraw: nextDraw ? nextDraw.toISOString() : null,
        intervalMinutes: DRAW_INTERVAL_MS / 60000,
        remainingMs
      },
      winners
    }
  } catch (error) {
    console.error('Failed to fetch lottery status:', error)

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch lottery status',
      data: {
        success: false,
        error: error.message
      }
    })
  }
})
