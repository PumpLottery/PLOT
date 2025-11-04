<template>
  <div class="container">
    <header>
      <h1>PumpLottery In Solana</h1>
      <p class="subtitle">Every 10 minutes we refresh the holder list and drop 50% of the jackpot straight to one lucky wallet.</p>
    </header>

    <div class="card intro-card">
      <h2>What Is PumpLottery?</h2>
      <p>
        PumpLottery lives on Solana and runs like a pixel arcade machine wrapped in meme energy.
        We snapshot token holders, roll the dice, and airdrop 50% of the jackpot into the winning wallet.
        The remaining 50% keeps the pool pulsing for the next round.
      </p>
    </div>

    <div class="status-grid">
      <div class="card jackpot-card">
        <div class="header-row">
          <h2>Jackpot Balance</h2>
          <button class="btn btn-small" @click="loadStatus" :disabled="statusLoading">
            {{ statusLoading ? 'Refreshing...' : 'Refresh' }}
          </button>
        </div>

        <div v-if="statusLoading && !statusData" class="loading">Fetching jackpot data...</div>
        <div v-else-if="statusError" class="result error">
          <p>{{ statusError }}</p>
        </div>
        <div v-else>
          <div class="jackpot-figure">{{ formatSol(jackpotBalanceSol) }} SOL</div>
          <div class="jackpot-details">
            <div class="jackpot-item">
              <span class="label">Jackpot address:</span>
              <code>{{ jackpotAddress ? formatAddress(jackpotAddress) : '-' }}</code>
              <button
                v-if="jackpotAddress"
                @click="copyAddress(jackpotAddress)"
                class="copy-btn"
                title="Copy address"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="card countdown-card">
        <h2>Airdrop Countdown</h2>
        <div class="countdown-timer">{{ countdownDisplay }}</div>
      </div>
    </div>

    <div class="card winners-card">
      <div class="header-row">
        <h2>Winners</h2>
        <button class="btn btn-small" @click="loadStatus" :disabled="statusLoading">
          {{ statusLoading ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>

      <div v-if="statusLoading && winners.length === 0" class="loading">Loading winners...</div>
      <div v-else-if="winners.length === 0" class="empty-state">
        <p class="muted">No winners yet. Hang tight for the next draw!</p>
      </div>
      <div v-else class="table-container">
        <table class="holders-table winners-table">
          <thead>
            <tr>
              <th>Wallet</th>
              <th>Win Time</th>
              <th>Prize (SOL)</th>
              <th>Tx</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="winner in winners" :key="winner.txSignature || winner.createdAt">
              <td class="address">
                <code>{{ formatAddress(winner.walletAddress) }}</code>
                <button
                  @click="copyAddress(winner.walletAddress)"
                  class="copy-btn"
                  title="Copy address"
                >
                  Copy
                </button>
              </td>
              <td>{{ formatDateTime(winner.createdAt) }}</td>
              <td class="balance">{{ formatSol(winner.amountSol) }}</td>
              <td>
                <a
                  v-if="winner.txSignature"
                  :href="txLink(winner.txSignature)"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View
                </a>
                <span v-else class="muted">-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Holder Leaderboard -->
    <div class="card">
      <div class="header-row">
        <h2>Holder Leaderboard</h2>
        <button @click="loadHolders" class="btn btn-small" :disabled="holdersLoading">
          {{ holdersLoading ? 'Loading...' : 'Refresh list' }}
        </button>
      </div>

      <div v-if="holdersLoading" class="loading">Loading holders...</div>

      <div v-else-if="holdersError" class="result error">
        <p>{{ holdersError }}</p>
      </div>

      <div v-else-if="holders.length > 0">
        <!-- Stats -->
        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-label">Total holders:</span>
            <span class="stat-value">{{ pagination.total }}</span>
          </div>
        </div>

        <!-- Holder Table -->
        <div class="table-container">
          <table class="holders-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Wallet</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="holder in holders" :key="holder.wallet_address">
                <td class="rank">
                  <span class="rank-badge" :class="getRankClass(holder.rank)">
                    #{{ holder.rank }}
                  </span>
                </td>
                <td class="address">
                  <code>{{ formatAddress(holder.wallet_address) }}</code>
                  <button @click="copyAddress(holder.wallet_address)" class="copy-btn" title="Copy address">
                    Copy
                  </button>
                </td>
                <td class="balance">{{ formatNumber(holder.balance_ui) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="pagination">
          <button 
            @click="changePage(pagination.page - 1)" 
            :disabled="pagination.page === 1"
            class="btn btn-small"
          >
            Prev
          </button>
          <span class="page-info">
            Page {{ pagination.page }} / {{ pagination.totalPages }}
          </span>
          <button 
            @click="changePage(pagination.page + 1)" 
            :disabled="pagination.page >= pagination.totalPages"
            class="btn btn-small"
          >
            Next
          </button>
        </div>
      </div>

      <div v-else class="empty-state">
        <p>No holder data yet</p>
        <p>Waiting for the next refresh cycle</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

// Jackpot status state
const statusData = ref(null)
const statusLoading = ref(false)
const statusError = ref(null)
const winners = ref([])
const nextDrawTime = ref(null)
const countdownMs = ref(0)

const STATUS_POLL_INTERVAL_MS = 30 * 1000
const COUNTDOWN_REFRESH_DELAY_MS = 2 * 1000

let countdownTimer = null
let statusPollTimer = null
let countdownRefreshTimeout = null

// Holder data state
const holders = ref([])
const holdersLoading = ref(false)
const holdersError = ref(null)
const pagination = ref({
  page: 1,
  limit: 50,
  total: 0,
  totalPages: 0
})
const lastUpdated = ref(null)
const lastUpdatedIso = ref(null)
const lastDrawIso = ref(null)

// Fetch status and holder data when the page mounts
onMounted(() => {
  loadStatus()
  loadHolders()
})

onBeforeUnmount(() => {
  stopCountdown()
})

const loadStatus = async () => {
  statusLoading.value = true
  statusError.value = null
  try {
    const response = await $fetch('/api/lottery/status')
    statusData.value = response
    winners.value = response.winners || []
    const nextDrawRaw = response.schedule?.nextDraw
    if (nextDrawRaw) {
      const parsed = new Date(nextDrawRaw)
      nextDrawTime.value = Number.isNaN(parsed.getTime()) ? null : parsed
    } else {
      nextDrawTime.value = null
    }
    const remainingFromServer = typeof response.schedule?.remainingMs === 'number'
      ? response.schedule.remainingMs
      : null
    if (remainingFromServer !== null && remainingFromServer > 0) {
      countdownMs.value = remainingFromServer
    }

    const latestDrawIso = toIsoString(response.schedule?.lastDraw)
    const drawChanged = latestDrawIso && latestDrawIso !== lastDrawIso.value
    if (latestDrawIso) {
      lastDrawIso.value = latestDrawIso
    }
    if (drawChanged || countdownTimer === null) {
      countdownMs.value = computeRemainingMs()
    }

    const latestHolderUpdate = toIsoString(response.schedule?.lastUpdate)
    if (
      latestHolderUpdate &&
      latestHolderUpdate !== lastUpdatedIso.value &&
      !holdersLoading.value
    ) {
      await loadHolders()
    }

    if (drawChanged || countdownTimer === null) {
      startCountdown()
    }
  } catch (e) {
    statusError.value = e.data?.error || e.message || 'Failed to fetch lottery status'
  } finally {
    statusLoading.value = false
  }
}

const startCountdown = () => {
  stopCountdown()
  updateCountdown()
  countdownTimer = setInterval(updateCountdown, 1000)
  statusPollTimer = setInterval(() => {
    if (!statusLoading.value) {
      loadStatus()
    }
  }, STATUS_POLL_INTERVAL_MS)
}

const stopCountdown = () => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  if (statusPollTimer) {
    clearInterval(statusPollTimer)
    statusPollTimer = null
  }
  if (countdownRefreshTimeout) {
    clearTimeout(countdownRefreshTimeout)
    countdownRefreshTimeout = null
  }
}

const updateCountdown = () => {
  countdownMs.value = computeRemainingMs()
  if (countdownMs.value <= 0) {
    scheduleCountdownRefresh()
  }
  return countdownMs.value
}

const computeRemainingMs = () => {
  if (!nextDrawTime.value) {
    return 0
  }
  const diff = nextDrawTime.value.getTime() - Date.now()
  return diff > 0 ? diff : 0
}

const scheduleCountdownRefresh = () => {
  if (statusLoading.value || countdownRefreshTimeout) {
    return
  }
  countdownRefreshTimeout = setTimeout(async () => {
    countdownRefreshTimeout = null
    if (!statusLoading.value) {
      await loadStatus()
    }
  }, COUNTDOWN_REFRESH_DELAY_MS)
}

const formatDuration = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) {
    return '00:00'
  }
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value) => String(value).padStart(2, '0')
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${pad(minutes)}:${pad(seconds)}`
}

const countdownDisplay = computed(() => {
  if (!nextDrawTime.value) {
    return 'Pending'
  }
  return formatDuration(countdownMs.value)
})

const lastUpdateDisplay = computed(() => {
  const lastUpdate = statusData.value?.schedule?.lastUpdate
  if (!lastUpdate) {
    return 'No record yet'
  }
  const date = new Date(lastUpdate)
  if (Number.isNaN(date.getTime())) {
    return 'No record yet'
  }
  return date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit', hour12: true, timeZone: 'America/New_York' })
})

const jackpotAddress = computed(() => statusData.value?.jackpot?.address || '')
const jackpotBalanceSol = computed(() => statusData.value?.jackpot?.balanceSol ?? 0)

const txLink = (signature) => `https://solscan.io/tx/${signature}`

const formatSol = (value) => {
  const num = Number(value ?? 0)
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  }).format(num)
}

const loadHolders = async () => {
  holdersLoading.value = true
  holdersError.value = null
  try {
    const response = await $fetch('/api/holders/list', {
      query: {
        page: pagination.value.page,
        limit: pagination.value.limit
      }
    })
    
    holders.value = response.data
    pagination.value = response.pagination
    const holdersUpdatedIso = toIsoString(response.lastUpdated)
    lastUpdatedIso.value = holdersUpdatedIso
    lastUpdated.value = holdersUpdatedIso
  } catch (e) {
    holdersError.value = e.data?.error || e.message || 'Failed to load holders'
  } finally {
    holdersLoading.value = false
  }
}

const changePage = (newPage) => {
  if (newPage < 1 || newPage > pagination.value.totalPages) return
  pagination.value.page = newPage
  loadHolders()
}

const formatDateTime = (timestamp) => {
  if (!timestamp) {
    return '-'
  }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }
  return date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: true,
    timeZone: 'America/New_York'
  })
}

// === Utility helpers ===
const formatAddress = (address) => {
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
}

const formatNumber = (num) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num)
}

const formatTime = (timestamp) => {
  if (!timestamp) return 'Unknown'
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hours ago`
  return date.toLocaleString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true })
}

const toIsoString = (value) => {
  if (!value) return null

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const normalized = trimmed.replace(' ', 'T')
    const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)
    const isoCandidate = hasTimezone ? normalized : `${normalized}Z`
    const dateFromString = new Date(isoCandidate)
    if (!Number.isNaN(dateFromString.getTime())) {
      return dateFromString.toISOString()
    }
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

const getRankClass = (rank) => {
  if (rank === 1) return 'rank-gold'
  if (rank === 2) return 'rank-silver'
  if (rank === 3) return 'rank-bronze'
  return ''
}

const copyAddress = async (address) => {
  try {
    await navigator.clipboard.writeText(address)
    alert('Address copied!')
  } catch (e) {
    console.error('Copy failed:', e)
  }
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');

:global(body) {
  margin: 0;
  background: #030712;
  background-image:
    radial-gradient(circle at 10% 10%, rgba(56, 189, 248, 0.08) 0, transparent 40%),
    radial-gradient(circle at 80% 0%, rgba(14, 165, 233, 0.1) 0, transparent 45%),
    linear-gradient(135deg, #020617 0%, #0f172a 100%);
  color: #f8fafc;
  font-family: 'VT323', 'Press Start 2P', monospace;
  letter-spacing: 0.02em;
}

.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 56px 24px 120px;
  position: relative;
}

header {
  text-align: center;
  margin-bottom: 64px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

h1 {
  font-family: 'Press Start 2P', 'VT323', monospace;
  font-size: 3.2rem;
  text-transform: uppercase;
  color: #38bdf8;
  text-shadow:
    3px 3px 0 #0f172a,
    6px 6px 0 rgba(8, 47, 73, 0.6);
  margin: 0;
  display: inline-block;
  letter-spacing: 0.15em;
  white-space: nowrap;
  text-align: center;
  margin-left: 10px;
}

.subtitle {
  font-size: 1.35rem;
  color: #bae6fd;
  line-height: 1.6;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.card {
  position: relative;
  background: linear-gradient(160deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.78));
  border: 3px solid #38bdf8;
  box-shadow: 8px 8px 0 #0b1120;
  padding: 32px;
  margin-bottom: 32px;
  border-radius: 0;
  overflow: hidden;
}

.card::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 2px solid rgba(59, 130, 246, 0.25);
  pointer-events: none;
  mix-blend-mode: screen;
}

.card h2 {
  margin-top: 0;
  font-family: 'Press Start 2P', 'VT323', monospace;
  font-size: 1.4rem;
  color: #fbbf24;
  letter-spacing: 0.08em;
  margin-bottom: 18px;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.intro-card p {
  margin: 0;
  line-height: 1.8;
  font-size: 1.25rem;
  color: #e0f2fe;
  text-shadow: 2px 2px 0 rgba(8, 47, 73, 0.75);
}

.status-grid {
  display: grid;
  gap: 28px;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  margin-bottom: 16px;
}

.jackpot-figure {
  font-size: 3rem;
  font-family: 'Press Start 2P', monospace;
  color: #fcd34d;
  text-shadow:
    3px 3px 0 #1d4ed8,
    6px 6px 0 rgba(14, 116, 144, 0.6);
  margin: 12px 0 24px;
}

.jackpot-details {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.jackpot-item {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 1.05rem;
}

.jackpot-item .label {
  color: #67e8f9;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.jackpot-item code {
  background: rgba(15, 118, 110, 0.15);
  padding: 8px 12px;
  border: 2px solid #0d9488;
  box-shadow: 3px 3px 0 #0f172a;
  font-size: 0.95rem;
  letter-spacing: 0.12em;
}

.countdown-card {
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
}

.countdown-timer {
  font-size: 2.8rem;
  font-family: 'Press Start 2P', monospace;
  color: #4ade80;
  text-shadow:
    3px 3px 0 #14532d,
    5px 5px 0 rgba(15, 118, 110, 0.45);
}

.muted {
  color: rgba(226, 232, 240, 0.7);
  font-size: 1rem;
  letter-spacing: 0.08em;
}

.btn {
  padding: 12px 26px;
  border: 3px solid #0f172a;
  background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
  color: #030712;
  font-size: 0.95rem;
  font-family: 'Press Start 2P', monospace;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  box-shadow: 4px 4px 0 #0b1120;
  transition: transform 0.1s ease;
}

.btn-small {
  padding: 10px 20px;
  font-size: 0.8rem;
}

.btn:hover {
  transform: translate(-2px, -2px);
}

.btn:active {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 #0b1120;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.loading {
  padding: 32px 12px;
  text-align: center;
  font-size: 1.2rem;
  color: #bae6fd;
  letter-spacing: 0.1em;
}

.result {
  margin-top: 24px;
  padding: 24px;
  border: 3px solid #ef4444;
  background: rgba(239, 68, 68, 0.12);
  font-size: 1.05rem;
  line-height: 1.6;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.result.error {
  color: #fecaca;
}

.winners-table td {
  vertical-align: middle;
}

.table-container {
  overflow-x: auto;
  margin: 24px 0;
  border: 3px solid #38bdf8;
  box-shadow: 6px 6px 0 #0b1120;
}

.stats-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  background: rgba(56, 189, 248, 0.15);
  border: 2px solid rgba(94, 234, 212, 0.6);
  padding: 18px 20px;
  margin-bottom: 16px;
  box-shadow: 4px 4px 0 #0b1120;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1rem;
  letter-spacing: 0.08em;
}

.stat-label {
  text-transform: uppercase;
  color: #67e8f9;
}

.stat-value {
  font-family: 'Press Start 2P', monospace;
  color: #facc15;
}

.holders-table {
  width: 100%;
  border-collapse: collapse;
  background: rgba(8, 47, 73, 0.65);
  color: #f8fafc;
  font-size: 1.05rem;
}

.holders-table thead {
  background: rgba(56, 189, 248, 0.2);
}

.holders-table th,
.holders-table td {
  padding: 16px 18px;
  border: 2px solid rgba(56, 189, 248, 0.3);
  text-align: left;
}

.holders-table th {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #bae6fd;
  font-size: 0.95rem;
}

.holders-table tr:nth-child(odd) {
  background: rgba(8, 47, 73, 0.4);
}

.holders-table tr:hover {
  background: rgba(13, 148, 136, 0.3);
}

.rank-badge {
  display: inline-block;
  padding: 6px 12px;
  border: 2px solid #fbbf24;
  background: #fde68a;
  color: #78350f;
  font-size: 0.85rem;
  letter-spacing: 0.12em;
  box-shadow: 3px 3px 0 #0f172a;
}

.rank-gold {
  border-color: #fcd34d;
  background: #facc15;
  color: #78350f;
}

.rank-silver {
  border-color: #e2e8f0;
  background: #cbd5f5;
  color: #1f2937;
}

.rank-bronze {
  border-color: #f97316;
  background: #fb923c;
  color: #431407;
}

.address {
  display: flex;
  align-items: center;
  gap: 10px;
}

.address code {
  background: rgba(7, 89, 133, 0.6);
  padding: 6px 10px;
  border: 2px solid #22d3ee;
  box-shadow: 3px 3px 0 #0f172a;
  font-size: 0.95rem;
  letter-spacing: 0.12em;
}

.copy-btn {
  background: linear-gradient(135deg, #f472b6 0%, #ec4899 100%);
  border: 3px solid #0f172a;
  box-shadow: 3px 3px 0 #0b1120;
  padding: 6px 8px;
  font-size: 0.95rem;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.copy-btn:hover {
  transform: translate(-2px, -2px);
}

.copy-btn:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 #0b1120;
}

.balance {
  font-weight: 700;
  color: #4ade80;
  text-shadow: 2px 2px 0 #14532d;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 24px;
  margin-top: 28px;
}

.page-info {
  font-size: 0.95rem;
  letter-spacing: 0.12em;
  color: #bae6fd;
  text-transform: uppercase;
}

.empty-state {
  text-align: center;
  padding: 72px 20px;
  color: #bae6fd;
  font-size: 1.2rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.empty-state p {
  margin: 12px 0;
}

@media (max-width: 640px) {
  .container {
    padding: 40px 16px 80px;
  }

  header {
    margin-bottom: 48px;
    gap: 14px;
  }

  h1 {
    font-size: 2.4rem;
    letter-spacing: 0.12em;
    white-space: nowrap;
  }

  .subtitle {
    font-size: 1rem;
  }

  .card {
    padding: 24px;
    box-shadow: 6px 6px 0 #0b1120;
  }

  .jackpot-figure {
    font-size: 2.3rem;
  }

  .countdown-timer {
    font-size: 2.2rem;
  }

  .holders-table th,
  .holders-table td {
    padding: 12px;
  }
}
</style>
