import { getHeader, getQuery } from 'h3'

export function requireAdminSecret(event) {
  const config = useRuntimeConfig()
  const expected = config.adminApiSecret

  // Skip validation when no secret is configured (useful for local development)
  if (!expected) {
    return
  }

  const query = getQuery(event)
  const headerSecret = getHeader(event, 'x-admin-secret') || getHeader(event, 'authorization')
  const bearerSecret = headerSecret?.startsWith('Bearer ') ? headerSecret.slice(7) : headerSecret
  const provided = query.secret || bearerSecret

  if (typeof provided === 'string' && provided === expected) {
    return
  }

  throw createError({
    statusCode: 401,
    statusMessage: 'Unauthorized',
    data: {
      success: false,
      error: 'Admin secret is missing or invalid'
    }
  })
}
