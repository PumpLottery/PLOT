import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js'
import bs58 from 'bs58'
import { Buffer } from 'buffer'

export const DRAW_INTERVAL_MS = 10 * 60 * 1000
export const MIN_DRAW_INTERVAL_MS = 9 * 60 * 1000
export const FEE_BUFFER_LAMPORTS = 5_000

export function getHeliusRpcUrl(apiKey) {
  if (!apiKey) {
    throw new Error('Missing HELIUS_API_KEY configuration')
  }
  const trimmed = apiKey.trim()
  if (trimmed.startsWith('http')) {
    return trimmed
  }
  return `https://mainnet.helius-rpc.com/?api-key=${trimmed}`
}

export function createHeliusConnection(apiKey) {
  const url = getHeliusRpcUrl(apiKey)
  return new Connection(url, 'confirmed')
}

export function decodeSecretKey(secret) {
  if (!secret) {
    throw new Error('Missing ADMIN_SECRET_KEY configuration')
  }
  const trimmed = secret.trim()
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed)
    return Uint8Array.from(parsed)
  }
  try {
    return bs58.decode(trimmed)
  } catch (error) {
    // ignore and try base64
  }
  try {
    return Uint8Array.from(Buffer.from(trimmed, 'base64'))
  } catch (error) {
    throw new Error('Unable to parse ADMIN_SECRET_KEY; expected base58 or JSON array format')
  }
}

export function getAdminKeypair(secret) {
  const secretBytes = decodeSecretKey(secret)
  return Keypair.fromSecretKey(secretBytes)
}

export function lamportsToSol(lamports) {
  if (!lamports || Number.isNaN(lamports)) {
    return 0
  }
  return lamports / LAMPORTS_PER_SOL
}

export function calculatePayoutLamports(balanceLamports) {
  if (!Number.isFinite(balanceLamports) || balanceLamports <= FEE_BUFFER_LAMPORTS) {
    return 0
  }
  const target = Math.floor(balanceLamports * 0.5)
  const maxTransferable = balanceLamports - FEE_BUFFER_LAMPORTS
  const lamports = Math.min(target, maxTransferable)
  return lamports > 0 ? lamports : 0
}
