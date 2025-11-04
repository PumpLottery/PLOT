# PLOT
PumpLottery rewards PLTO token holders on Solana with 10‑minute jackpot airdrops; each round pays out 50% of the available SOL to one wallet and rolls the remainder forward (pages/index.vue (lines 4-14), server/utils/lottery.js (lines 5-64)).
The stack combines a Nuxt/Vue frontend, Nitro server APIs, Helius RPC access, and Vercel Postgres for holder and winner persistence.
A private admin wallet (configured via ADMIN_SECRET_KEY) acts as the prize pool; all transfers originate from and are publicly visible at this address.
How It Works

Holder Sync Cron endpoint /api/cron/update-holders can refresh PLTO holders by calling /api/holders/fetch, which pulls paginated account data from Helius, resolves decimals, ranks by balance, and updates the token_holders table (server/api/holders/fetch.js (lines 31-197)).
Eligibility Any wallet with a non-zero PLTO balance enters; the draw selects one row uniformly using ORDER BY RANDOM() so holdings size doesn’t affect odds (server/api/cron/update-holders.js (lines 90-99)).
Draw Frequency A minimum 9-minute gap between wins prevents duplicate payouts, while DRAW_INTERVAL_MS targets 10-minute cadence for scheduling and UI countdowns (server/utils/lottery.js (lines 5-7), server/api/cron/update-holders.js (lines 76-88)).
Payouts The cron task transfers up to half the admin wallet’s balance (minus a 5,000 lamport fee buffer) to the selected winner, logging lamports, SOL amount, and transaction signature in lottery_winners (server/utils/lottery.js (lines 58-65), server/api/cron/update-holders.js (lines 102-149)).
Frontend Features

Jackpot Panel Displays live SOL balance and public address with copy action, backed by /api/lottery/status (pages/index.vue (lines 17-107)).
Countdown Timer Shows time until the next scheduled draw, recalculating every second and re-polling status on expiry (pages/index.vue (lines 247-313)).
Winners Table Lists historical payouts with timestamps, SOL amounts, and Solscan links; entries update whenever status refreshes (pages/index.vue (lines 55-106)).
Holder Leaderboard Offers paginated ranking with balance display and copyable addresses, using GET /api/holders/list?page&limit (pages/index.vue (lines 108-187), server/api/holders/list.js (lines 1-56)).
Error Handling Loading states and error banners appear for RPC or API failures, plus manual refresh controls for both status and holder data (pages/index.vue (lines 21-120)).
Backend Services

Status Endpoint /api/lottery/status validates configuration, fetches jackpot balance from Helius, materializes winner history, and computes schedule metadata including remainingMs for the UI (server/api/lottery/status.js (lines 1-83)).
Cron Endpoint /api/cron/update-holders refreshes holders (optional via ?refresh=false) and executes draws for automated deployment via Vercel Cron or any scheduler (server/api/cron/update-holders.js (lines 18-55)).
Admin Helpers /api/db-init resets (truncate) the tables and ensures schema, while /api/db-test checks Postgres connectivity; both require admin authorization (server/api/db-init.js (lines 1-47), server/api/db-test.js (lines 1-46)).
Security Gate requireAdminSecret guards cron, fetch, and init routes by checking secret query param or x-admin-secret/Authorization header against ADMIN_API_SECRET (skipped when unset for local development) (server/utils/auth.js (lines 4-36)).
Database Schema ensureTokenHoldersTable and ensureLotteryWinnersTable create required tables with indexes and ensure legacy columns are dropped (server/utils/db.js (lines 3-40)).
Configuration

const CONFIG = {
  RPC_ENDPOINT: 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
  WALLET_ADDRESS: 'ADMIN_PUBLIC_KEY',
  TOKEN_MINT: 'PLTO_MINT_ADDRESS',
  TOKENS_PER_TICKET: 'N/A – every holder has equal odds'
};
Environment Variables POSTGRES_URL, HELIUS_API_KEY, TOKEN_MINT_ADDRESS, ADMIN_SECRET_KEY, ADMIN_API_SECRET (private) plus the frontend public.apiBase; Nuxt exposes them in runtime config (nuxt.config.js (lines 9-29)).
Secret Key Formats ADMIN_SECRET_KEY may be a JSON array, base58, or base64 string; decodeSecretKey normalizes it before constructing the Keypair used for payouts (server/utils/lottery.js (lines 25-49)).
Fee Buffer FEE_BUFFER_LAMPORTS reserves 5,000 lamports so the wallet never empties, preventing failed transfers due to lack of fees (server/utils/lottery.js (lines 5-7)).
File Structure

PLTO/
├── pages/index.vue        # Main dashboard UI
├── app.vue                # Nuxt root with metadata
├── server/api/            # Nitro endpoints (cron, holders, lottery, db utilities)
├── server/utils/          # Shared helpers for lottery logic, auth, db, time
├── components/            # (Reserved for future UI pieces)
├── public/                # Static assets like favicon
├── nuxt.config.js         # Runtime configuration and Nitro tweaks
└── package.json           # Dependencies and scripts
Setup & Deployment

Local Install dependencies (pnpm install), configure required env vars, ensure Postgres and Helius credentials are available, then run pnpm dev. Invoke /api/db-init (with secret) once to create tables, followed by /api/holders/fetch to seed data.
Production Deploy to Vercel/Nitro target, supply environment variables, and point a scheduler (e.g., Vercel Cron every 10 minutes) at /api/cron/update-holders. Confirm HTTPS and RPC endpoints are stable, and monitor jackpot wallet activity.
Verification Use /api/db-test to validate database connectivity post-deploy, confirm jackpot balance on the homepage, and review winner entries to ensure transactions appear on Solscan.
API Reference

GET /api/lottery/status → { jackpot, schedule, winners }
GET /api/holders/list?page&limit → { data, pagination, lastUpdated }
POST /api/holders/fetch (admin) → refresh PLTO holders via Helius
POST /api/cron/update-holders?refresh=false|true (admin) → run optional sync + draw
POST /api/db-init (admin) → truncate + ensure schema
GET /api/db-test (admin) → health check
Refresh & Scheduling

Frontend polls /api/lottery/status every 30 seconds (STATUS_POLL_INTERVAL_MS) and refreshes the countdown per second; hitting zero triggers a status reload to catch the new draw (pages/index.vue (lines 202-313)).
The backend computes nextDraw by adding DRAW_INTERVAL_MS (10 minutes) to the more recent of lastDraw or lastUpdate, adjusting forward if that time already passed (server/api/lottery/status.js (lines 53-77)).
Cron should run at or slightly after the 10-minute mark. When backlog or rate limits cause errors, the API returns skipped: true with context so the scheduler can log and try again later (server/api/cron/update-holders.js (lines 70-115)).
Security & Transparency

The jackpot address is public on the landing page, making pool funds and payouts auditable; each recorded win includes the SOL amount, timestamp, and transaction signature for verification (pages/index.vue (lines 31-45), server/api/lottery/status.js (lines 25-48)).
Admin routes must remain behind strong secrets in production; remove or lock down instances where ADMIN_API_SECRET is empty before going live (server/utils/auth.js (lines 10-35)).
Randomness currently relies on database sampling, not Solana VRF—plan upgrades if cryptographic randomness is a requirement, or expose the selection method to stakeholders for transparency.
Troubleshooting

RPC Errors Verify HELIUS_API_KEY, ensure quota isn’t exhausted, and check network access. The fetch script logs page-by-page progress and stops after 10 pages to prevent runaway loops (server/api/holders/fetch.js (lines 70-122)).
Empty Holder List Confirm TOKEN_MINT_ADDRESS matches the PLTO mint; absence of holders results in skipped draws (server/api/holders/fetch.js (lines 31-48), server/api/cron/update-holders.js (lines 90-104)).
Skipped Draws Triggers include insufficient lamports (calculatePayoutLamports returning 0) or draw cooldown not met; logs specify the reason in the API response (server/api/cron/update-holders.js (lines 76-115)).
Invalid Winner Address Rare cases where a stored wallet is malformed will abort the transfer and mark the round as skipped, with an error recorded (server/api/cron/update-holders.js (lines 116-125)).
Contributing Guidelines

Preserve the 10-minute cadence, holder sync accuracy, and payout logging when modifying backend logic.
Maintain responsive design, pixel-art theming, and the pure Vue implementation on the frontend; provide comments sparingly for complex sections only.
Add guardrails for new admin endpoints and extend existing tests or diagnostics to cover new flows.
Coordinate schema changes through ensureTokenHoldersTable / ensureLotteryWinnersTable to keep migrations consistent.
License & Disclaimer

PumpLottery is open source; operators must comply with applicable lottery, gambling, and airdrop regulations.
Participation carries financial risk. The system is provided “as-is” for educational and entertainment purposes; users are responsible for their own decisions and should exercise caution.
