import { sql } from '@vercel/postgres'
import { requireAdminSecret } from '../../utils/auth.js'

export default defineEventHandler(async (event) => {
  try {
    requireAdminSecret(event)
    const config = useRuntimeConfig()
    
    // Load API key and token mint from runtime config
    let heliusApiKey = config.heliusApiKey
    const tokenMintAddress = config.tokenMintAddress
    
    // Normalize API key if a full URL was provided
    if (heliusApiKey && heliusApiKey.includes('api-key=')) {
      heliusApiKey = heliusApiKey.split('api-key=')[1]
    }
    
    // Validate required configuration
    if (!heliusApiKey) {
      throw new Error('HELIUS_API_KEY is not configured')
    }
    if (!tokenMintAddress) {
      throw new Error('TOKEN_MINT_ADDRESS is not configured')
    }
    
    console.log('API Key:', heliusApiKey.substring(0, 10) + '...')
    console.log('Token mint:', tokenMintAddress)
    console.log('Starting holder data fetch...')
    
    const startTime = Date.now()
    
    // Fetch token decimals
    const tokenDecimals = await getTokenDecimals(heliusApiKey, tokenMintAddress)

    // Fetch all holders
    const holders = await fetchAllHolders(heliusApiKey, tokenMintAddress, tokenDecimals)
    
    console.log(`Retrieved ${holders.length} holders`)
    
    if (holders.length === 0) {
      return {
        success: true,
        message: 'No holders found (token may not exist or has no owners)',
        stats: {
          totalHolders: 0
        }
      }
    }
    
    // Rank holders by balance
    const holdersWithRank = holders
      .sort((a, b) => Number(b.balance) - Number(a.balance))
      .map((holder, index) => ({
        ...holder,
        rank: index + 1
      }))
    
    // Persist new holder data
    await updateDatabase(holdersWithRank)
    
    const endTime = Date.now()
    const duration = ((endTime - startTime) / 1000).toFixed(2)
    
    return {
      success: true,
      message: 'Holder data refreshed successfully',
      stats: {
        totalHolders: holders.length,
        duration: `${duration}s`,
        timestamp: new Date().toISOString(),
        topHolders: holdersWithRank.slice(0, 5).map(h => ({
          address: h.wallet_address.substring(0, 8) + '...',
          balance: h.balance_ui,
          rank: h.rank
        }))
      }
    }
    
  } catch (error) {
    console.error('Failed to fetch holder list:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch holder list',
      data: {
        success: false,
        error: error.message,
        details: error.toString()
      }
    })
  }
})

/**
 * Fetch all holders with pagination.
 */
async function fetchAllHolders(apiKey, mintAddress, defaultDecimals) {
  const allHolders = []
  let page = 1
  const limit = 1000 // Helius caps page size at 1000
  let hasMore = true
  
  while (hasMore && page <= 10) { // Limit to 10 pages to avoid runaway loops
    console.log(`Fetching page ${page}...`)
    
    try {
      const response = await fetch(
        `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `helius-page-${page}`,
            method: 'getTokenAccounts',
            params: {
              page,
              limit,
              mint: mintAddress,
              options: {
                showZeroBalance: false
              }
            }
          })
        }
      )
      
      if (!response.ok) {
        throw new Error(`Helius API request failed: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      
      if (data.error) {
        throw new Error(`Helius API error: ${data.error.message || JSON.stringify(data.error)}`)
      }
      
      const accounts = data.result?.token_accounts || []
      
      console.log(`Page ${page} returned ${accounts.length} records`)
      
      if (accounts.length === 0) {
        hasMore = false
        break
      }
      
      // Normalize holder records
      const holders = accounts.map(account => {
        const decimals = resolveDecimals(account, defaultDecimals)
        const rawAmount = resolveRawAmount(account)
        return {
          wallet_address: account.owner,
          balance: rawAmount,
          balance_ui: parseFloat(rawAmount) / Math.pow(10, decimals)
        }
      })
      
      allHolders.push(...holders)
      
      // Less than the limit implies we've reached the final page
      if (accounts.length < limit) {
        hasMore = false
      } else {
        page++
      }
      
    } catch (error) {
      console.error(`Failed to fetch page ${page}:`, error.message)
      throw error
    }
  }
  
  return allHolders
}

/**
 * Fetch the token decimal precision.
 */
async function getTokenDecimals(apiKey, mintAddress) {
  try {
    const response = await fetch(
      `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `helius-mint-${mintAddress}`,
          method: 'getTokenSupply',
          params: [mintAddress]
        })
      }
    )

    if (!response.ok) {
      throw new Error(`Helius getTokenSupply request failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const decimals = data.result?.value?.decimals

    if (typeof decimals === 'number') {
      console.log(`Token decimals: ${decimals}`)
      return decimals
    }

    console.warn('No decimals returned by getTokenSupply; defaulting to 9')
    return 9
  } catch (error) {
    console.error('Failed to retrieve token decimals:', error.message)
    return 9
  }
}

/**
 * Resolve the decimals field from a token account response.
 */
function resolveDecimals(account, fallbackDecimals) {
  const candidates = [
    account.decimals,
    account?.tokenAmount?.decimals,
    account?.token_amount?.decimals,
    account?.token_account?.token_amount?.decimals,
    account?.token_account_info?.parsed?.info?.tokenAmount?.decimals,
    account?.account?.data?.parsed?.info?.tokenAmount?.decimals,
    account?.token_info?.decimals
  ]

  for (const value of candidates) {
    if (typeof value === 'number') {
      return value
    }
  }

  return fallbackDecimals ?? 9
}

/**
 * Resolve the raw balance value from a token account response.
 */
function resolveRawAmount(account) {
  const candidates = [
    account.amount,
    account?.tokenAmount?.amount,
    account?.token_amount?.amount,
    account?.token_account?.token_amount?.amount,
    account?.token_account_info?.parsed?.info?.tokenAmount?.amount,
    account?.account?.data?.parsed?.info?.tokenAmount?.amount
  ]

  for (const value of candidates) {
    if (typeof value === 'string' && value) {
      return value
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value.toString()
    }
  }

  return '0'
}

/**
 * Batch update token holder data in the database.
 */
async function updateDatabase(holders) {
  console.log('Beginning database update...')
  
  try {
    // Clear existing holder records
    await sql`DELETE FROM token_holders`
    console.log('Cleared existing holder records')
    
    if (holders.length === 0) {
      console.log('No holder records to insert')
      return
    }
    
    // Insert holders in batches of 100
    const batchSize = 100
    for (let i = 0; i < holders.length; i += batchSize) {
      const batch = holders.slice(i, i + batchSize)
      
      // Upsert each entry
      for (const holder of batch) {
        await sql`
          INSERT INTO token_holders (wallet_address, balance, balance_ui, rank, updated_at) 
          VALUES (
            ${holder.wallet_address}, 
            ${holder.balance}, 
            ${holder.balance_ui}, 
            ${holder.rank}, 
            NOW()
          )
          ON CONFLICT (wallet_address) 
          DO UPDATE SET 
            balance = EXCLUDED.balance,
            balance_ui = EXCLUDED.balance_ui,
            rank = EXCLUDED.rank,
            updated_at = NOW()
        `
      }
      
      console.log(`Inserted ${Math.min(i + batchSize, holders.length)}/${holders.length} records`)
    }
    
    console.log('Database update complete')
    
  } catch (error) {
    console.error('Database update failed:', error)
    throw error
  }
}
