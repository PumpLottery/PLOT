import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const jaysonBrowserPath = require.resolve('jayson/lib/client/browser/index.js')

export default defineNuxtConfig({
  devtools: { enabled: true },
  
  runtimeConfig: {
    // Private runtime values (server-only)
    postgresUrl: process.env.POSTGRES_URL,
    heliusApiKey: process.env.HELIUS_API_KEY,
    tokenMintAddress: process.env.TOKEN_MINT_ADDRESS,
    adminSecretKey: process.env.ADMIN_SECRET_KEY,
    adminApiSecret: process.env.ADMIN_API_SECRET,
    
    // Public runtime values (also exposed to client)
    public: {
      apiBase: '/api'
    }
  },

  nitro: {
    alias: {
      'jayson/lib/client/browser': jaysonBrowserPath,
      'jayson/lib/client/browser/index.js': jaysonBrowserPath
    }
  }
})
