import { sql } from '@vercel/postgres'
import { SystemProgram, Transaction, sendAndConfirmTransaction, PublicKey } from '@solana/web3.js'
import { createHeliusConnection, getAdminKeypair, lamportsToSol, calculatePayoutLamports, MIN_DRAW_INTERVAL_MS } from '../../utils/lottery.js'
import { requireAdminSecret } from '../../utils/auth.js'
import { ensureTokenHoldersTable, ensureLotteryWinnersTable } from '../../utils/db.js'

/**
 * Scheduled task endpoint invoked by Vercel Cron,
 * or manually via /api/cron/update-holders to trigger a refresh.
 */
export default defineEventHandler(async (event) => {
  try {
    requireAdminSecret(event)
    console.log('Scheduled task started:', new Date().toISOString())
    const query = getQuery(event)
    const refresh = query.refresh !== 'false'
    
    // Optionally refresh holder data via the fetch endpoint
    const config = useRuntimeConfig()

    const result = refresh
      ? await $fetch('/api/holders/fetch', {
          method: 'POST',
          headers: {
            'x-admin-secret': config.adminApiSecret || ''
          }
        })
      : null

    // Run the lottery draw after refreshing holders
    const lottery = await runLotteryDraw()
    
    console.log('Scheduled task completed:', {
      holders: result?.stats,
      lottery
    })
    
    return {
      success: true,
      message: 'Scheduled task executed successfully',
      refreshApplied: refresh,
      result,
      lottery
    }
    
  } catch (error) {
    console.error('Scheduled task failed:', error)
    
    return {
      success: false,
      message: 'Scheduled task failed',
      error: error.message
    }
  }
})

async function runLotteryDraw() {
  try {
    const config = useRuntimeConfig()
    const heliusApiKey = config.heliusApiKey
    const adminSecretKey = config.adminSecretKey
    
    if (!heliusApiKey || !adminSecretKey) {
      return {
        success: false,
        skipped: true,
        message: 'Missing HELIUS_API_KEY or ADMIN_SECRET_KEY, skipping draw'
      }
    }
    
    const connection = createHeliusConnection(heliusApiKey)
    const adminKeypair = getAdminKeypair(adminSecretKey)
    
    await Promise.all([ensureTokenHoldersTable(), ensureLotteryWinnersTable()])
    
    const recentWinnerResult = await sql`SELECT created_at FROM lottery_winners ORDER BY created_at DESC LIMIT 1`
    const recentWinner = recentWinnerResult.rows[0] || null
    const now = Date.now()
    if (recentWinner?.created_at) {
      const lastDrawAt = new Date(recentWinner.created_at).getTime()
      if (now - lastDrawAt < MIN_DRAW_INTERVAL_MS) {
        return {
          success: true,
          skipped: true,
          message: 'Last draw was too recent; skipping this round'
        }
      }
    }
    
    const holdersResult = await sql`SELECT wallet_address FROM token_holders ORDER BY RANDOM() LIMIT 1`
    const winnerRow = holdersResult.rows[0]
    if (!winnerRow?.wallet_address) {
      return {
        success: false,
        skipped: true,
        message: 'No eligible holders available; skipping draw'
      }
    }
    
    console.log('Selected wallet:', winnerRow.wallet_address)
    
    const balanceLamports = await connection.getBalance(adminKeypair.publicKey)
    const lamportsToSend = calculatePayoutLamports(balanceLamports)
    
    if (lamportsToSend <= 0) {
      return {
        success: false,
        skipped: true,
        message: 'Jackpot balance is insufficient to complete a draw'
      }
    }
    
    const amountSol = lamportsToSol(lamportsToSend)
    const targetAddress = winnerRow.wallet_address.trim()

    let payoutPublicKey
    try {
      payoutPublicKey = new PublicKey(targetAddress)
    } catch (error) {
      console.error('Invalid winning address:', targetAddress, error)
      return {
        success: false,
        skipped: true,
        message: 'Winning address is invalid; skipping draw'
      }
    }

    console.log('Transferring 50% of jackpot balance to winner')
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: adminKeypair.publicKey,
        toPubkey: payoutPublicKey,
        lamports: lamportsToSend
      })
    )

    const txSignature = await sendAndConfirmTransaction(connection, transaction, [adminKeypair], {
      commitment: 'confirmed'
    })
    
    await sql`
      INSERT INTO lottery_winners (wallet_address, amount_lamports, amount_sol, tx_signature)
      VALUES (${winnerRow.wallet_address}, ${lamportsToSend}, ${amountSol}, ${txSignature})
    `
    
    return {
      success: true,
      skipped: false,
      winner: {
        selectedWalletAddress: winnerRow.wallet_address,
        payoutWalletAddress: targetAddress,
        amountLamports: lamportsToSend,
        amountSol,
        txSignature
      }
    }
  } catch (error) {
    console.error('Lottery draw failed:', error)
    return {
      success: false,
      skipped: false,
      message: 'Lottery draw failed',
      error: error.message
    }
  }
}
