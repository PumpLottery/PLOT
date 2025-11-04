# PumpLottery Documentation

## Overview
- PumpLottery rewards PLTO token holders on Solana with automated jackpot airdrops every 10 minutes; each round distributes 50 % of the SOL balance to one wallet and rolls the rest into the next cycle.
- The stack combines a Nuxt/Vue frontend, Nitro server APIs, Helius RPC access, and Vercel Postgres for holder and winner persistence.
- A private admin wallet (configured via `ADMIN_SECRET_KEY`) acts as the prize pool; all transfers originate from and remain visible at this public address.

## How It Works
- **Holder Sync** The cron endpoint `/api/cron/update-holders` can refresh PLTO holders by invoking `/api/holders/fetch`, which paginates Helius `getTokenAccounts`, resolves decimals, ranks by balance, and updates the `token_holders` table.
- **Eligibility** Any wallet with a non-zero PLTO balance participates. A draw selects one row uniformly at random (`ORDER BY RANDOM()`), so holdings size does not affect odds.
- **Draw Frequency** A minimum nine-minute gap between wins prevents duplicate payouts, while `DRAW_INTERVAL_MS` targets a 10-minute cadence for scheduling and UI countdowns.
- **Payouts** The cron task transfers up to half the admin wallet’s balance—minus a 5,000 lamport fee buffer—to the selected winner, logging lamports, SOL amount, and transaction signature inside `lottery_winners`.

## Frontend Features
- **Jackpot Panel** Displays live SOL balance and the public address with copy action, backed by `/api/lottery/status`.
- **Countdown Timer** Shows time until the next scheduled draw, recalculating every second and re-polling status once it expires.
- **Winners Table** Lists historical payouts with timestamps, SOL amounts, and Solscan links; entries update whenever status refreshes.
- **Holder Leaderboard** Offers paginated ranking with balance display and copyable addresses supplied by `GET /api/holders/list?page&limit`.
- **Error Handling** Loading states, error banners, and manual refresh controls keep the experience responsive even during RPC hiccups.

## Backend Services
- **Status Endpoint** `/api/lottery/status` validates configuration, fetches the jackpot balance from Helius, materializes winner history, and computes schedule metadata (including `remainingMs`) for the UI countdown.
- **Cron Endpoint** `/api/cron/update-holders` refreshes holders (optional via `?refresh=false`) and executes draws for automated scheduling through Vercel Cron or other runners.
- **Admin Helpers** `/api/db-init` resets the tables and ensures schema, while `/api/db-test` checks Postgres connectivity; both are admin-protected.
- **Security Gate** `requireAdminSecret` guards cron, fetch, and init routes by checking the `secret` query param or `x-admin-secret` / `Authorization` header against `ADMIN_API_SECRET` (skipped locally when unset).
- **Database Schema** `ensureTokenHoldersTable` and `ensureLotteryWinnersTable` create required tables with indexes and remove legacy columns.

## Configuration
```javascript
const CONFIG = {
  RPC_ENDPOINT: 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
  WALLET_ADDRESS: 'ADMIN_PUBLIC_KEY',
  TOKEN_MINT: 'PLTO_MINT_ADDRESS',
  TOKENS_PER_TICKET: 'N/A – every holder has equal odds'
};
```

- **Environment Variables** `POSTGRES_URL`, `HELIUS_API_KEY`, `TOKEN_MINT_ADDRESS`, `ADMIN_SECRET_KEY`, `ADMIN_API_SECRET` (private) plus the frontend `public.apiBase`; Nuxt exposes them through runtime config.
- **Secret Key Formats** `ADMIN_SECRET_KEY` may be a JSON array, base58 string, or base64 string; `decodeSecretKey` normalizes it and constructs the payout `Keypair`.
- **Fee Buffer** `FEE_BUFFER_LAMPORTS` reserves 5,000 lamports so the wallet never empties and transfers always cover Solana fees.

## File Structure
```
PLTO/
├── pages/index.vue        # Main dashboard UI
├── app.vue                # Nuxt root with metadata
├── server/api/            # Nitro endpoints (cron, holders, lottery, db utilities)
├── server/utils/          # Shared helpers for lottery logic, auth, db, time
├── components/            # Reserved for future UI components
├── public/                # Static assets (favicon, etc.)
├── nuxt.config.js         # Runtime configuration and Nitro tweaks
├── package.json           # Dependencies and scripts
└── README.md              # Documentation
```

## Setup & Deployment
- **Local** Install dependencies (`pnpm install`), configure required env vars, ensure Postgres and Helius credentials exist, then run `pnpm dev`. Invoke `/api/db-init` (with secret) to create tables, followed by `/api/holders/fetch` to seed data.
- **Production** Deploy to Vercel/Nitro target, supply environment variables, and point a scheduler (e.g., Vercel Cron every 10 minutes) at `/api/cron/update-holders`. Confirm HTTPS, RPC stability, and monitor jackpot wallet activity.
- **Verification** Use `/api/db-test` to validate database connectivity post-deploy, confirm jackpot balance on the homepage, and review winner entries to ensure transactions appear on Solscan.

## API Reference
- `GET /api/lottery/status` → `{ jackpot, schedule, winners }`
- `GET /api/holders/list?page&limit` → `{ data, pagination, lastUpdated }`
- `POST /api/holders/fetch` (admin) → Refresh PLTO holders via Helius
- `POST /api/cron/update-holders?refresh=false|true` (admin) → Run optional sync plus draw
- `POST /api/db-init` (admin) → Truncate + ensure schema
- `GET /api/db-test` (admin) → Health check

## Refresh & Scheduling
- The frontend polls `/api/lottery/status` every 30 seconds (`STATUS_POLL_INTERVAL_MS`) and updates the countdown once per second; hitting zero triggers a status reload to capture new draw data.
- The backend computes `nextDraw` by adding `DRAW_INTERVAL_MS` (10 minutes) to the more recent of `lastDraw` or `lastUpdate`, rolling forward when that timestamp already passed.
- Cron should run at or just after the 10-minute mark. When rate limits or balance checks fail, the API returns `skipped: true` along with diagnostic info so the scheduler can retry later.

## Security & Transparency
- The jackpot address is public on the landing page, making pool funds and payouts auditable; each recorded win includes SOL amount, timestamp, and transaction signature for external verification.
- Admin routes must remain locked behind secrets in production; remove or disable deployments with empty `ADMIN_API_SECRET`.
- Randomness currently relies on Postgres sampling rather than Solana VRF—plan upgrades if cryptographic randomness is required, or document the selection method for stakeholders.

## Troubleshooting
- **RPC Errors** Verify `HELIUS_API_KEY`, quota status, and network connectivity. The fetch script logs page-by-page progress and stops after ten pages to prevent runaway loops.
- **Empty Holder List** Confirm `TOKEN_MINT_ADDRESS` matches the PLTO mint; absence of holders results in skipped draws.
- **Skipped Draws** Triggers include insufficient lamports (`calculatePayoutLamports` returning 0) or cooldown not met; cron responses include `skipped` flags and reasons.
- **Invalid Winner Address** Malformed wallet entries abort transfers and mark the round as skipped with error output for follow-up.

## Contributing Guidelines
- Preserve the 10-minute cadence, holder sync accuracy, and payout logging when changing backend logic.
- Maintain the responsive, pixel-themed frontend; only add comments for non-obvious code paths.
- Secure any new admin endpoints and extend diagnostics or tests to cover fresh flows.
- Coordinate schema changes through `ensureTokenHoldersTable` and `ensureLotteryWinnersTable` to keep migrations consistent.

## License & Disclaimer
- PumpLottery is open source; operators must comply with applicable lottery, gambling, and airdrop regulations.
- Participation carries financial risk. The system is provided “as-is” for educational and entertainment purposes; participants are responsible for their own decisions and should exercise caution.

