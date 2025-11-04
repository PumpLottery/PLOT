export default defineEventHandler((event) => {
  return {
    success: true,
    message: 'API is running successfully!',
    timestamp: new Date().toISOString(),
    versions: {
      nuxt: '3.13.2',
      vue: '3.5.12',
      postgres: '0.10.0'
    },
    server: {
      platform: process.platform,
      nodeVersion: process.version
    }
  }
})
