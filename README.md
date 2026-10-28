# Club OS

One login that runs an independent pay to play sports club. Water polo first.

This is version 0.1: a working application, not a mockup. It has real sign in,
a real database, and a double entry ledger that every billing action posts to.

## Run it on your computer

You need [Node.js 20 or newer](https://nodejs.org). Nothing else. The database
is embedded and lives in the `.data` folder.

```
npm install
npm run setup     # creates the database and loads the demo club
npm run dev       # then open http://localhost:3000
```

The sign in page has one click buttons for each demo role. The password for
every demo account is `clubos-demo`. To start a fresh, empty club instead, click
**Create your club** on the sign in page.

| Sign in as | Email | What you see |
| --- | --- | --- |
| Director | director@demo.club | Dashboard, billing, finance, compliance, integrations |
| Coach | coach@demo.club | Own team roster, schedule, compliance, film |
| Parent | parent@demo.club | Balance, pay flow, schedule, film |
| Athlete | athlete@demo.club | Schedule and film, no money |

## The two demo paths for director calls

1. **Director.** Dashboard, then Billing. Create a charge for a team with three
   installments. Open Finance and show the same dollars already sitting in the
   team level P&L, with the ledger in balance. Export the general ledger.
2. **Parent.** Sign in as the parent, pay the overdue invoice, then switch back
   to the director and show Collected, Overdue and Cash all moved.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run locally with live reload |
| `npm test` | Unit tests for money math, the ledger and billing |
| `npm run typecheck` | Type check the whole project |
| `npm run build` then `npm start` | Production build and server |
| `npm run db:reset` | Wipe the local database and reload the demo club |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |

Stop the dev server before running `db:reset` or `db:seed`. The embedded
database allows one process at a time.

## Where to change things

| To change | Edit |
| --- | --- |
| Colors and fonts | `src/app/globals.css` |
| A screen | `src/app/(app)/<screen>/page.tsx` |
| What a form does | `actions.ts` next to that screen |
| Business rules (billing, ledger, compliance) | `src/server/domain/` |
| Chart of accounts | `DEFAULT_CHART` in `src/server/domain/ledger.ts` |
| Required credentials per role | `REQUIRED` in `src/server/domain/compliance.ts` |
| 1099 threshold | `src/lib/config.ts` |
| Tables and columns | `src/db/schema.ts`, then `npm run db:generate` |
| Demo data | `src/db/seed.ts` |
| Add an outside vendor | one file in `src/server/integrations/`, register in `registry.ts` |

## Putting it on the web

The app is a standard Next.js project on Postgres, so it deploys to Vercel,
Render, Railway, Fly or any Node host.

1. Create a Postgres database (Neon and Supabase both have free tiers).
2. Set `DATABASE_URL` to its connection string. See `.env.example`.
3. Run `npm run db:migrate` once against it.
4. Deploy. For a hosted demo, also set `DEMO_LOGIN=true` and
   `ALLOW_TEST_PAYMENTS=true`.

No code changes are needed to move from the embedded database to a hosted one.

See `docs/ARCHITECTURE.md` for how the pieces fit and what is deliberately not
built yet.
