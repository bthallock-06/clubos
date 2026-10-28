# Architecture

## Shape

```
Browser
  |
Next.js app (src/app)            screens, forms, API routes. No business rules.
  |
Domain layer (src/server/domain) billing, ledger, club, compliance, dashboard.
  |                              All rules and all authorization live here.
  +--> Event bus (src/server/events)        every change is logged and published
  +--> Integrations (src/server/integrations) payments, accounting, membership
  |
Postgres (src/db)                embedded PGlite locally, any Postgres when hosted
```

Dependencies point one way: screens call the domain, the domain calls the
database and the integration interfaces. Nothing in the domain imports from a
screen, and no screen talks to the database for a write.

## Rules the code holds itself to

1. **Tenant isolation.** Every table carries `club_id`. Every domain function
   takes a `Ctx` (club, user, role, timezone) and filters on it. A second club
   can be added to the same database today.
2. **Money is integer cents.** Conversion happens only in `src/lib/money.ts`.
3. **The ledger is the source of truth.** Issuing an invoice, taking a payment,
   voiding and recording an expense each write the operational row and the
   journal entry in one transaction. An entry that does not balance is rejected.
   Each source posts at most once (unique index), so nothing double counts.
4. **Payments are idempotent.** A payment is keyed on the processor's reference,
   so a webhook that fires twice is recorded once.
5. **Authorization is in the domain, not the menu.** Hiding a nav link is not
   security. `assertRole` and the household and team visibility checks run on
   the server for every read and write.
6. **Minimum data on minors.** Athletes have a name, grad year and cap number.
   No birth date, address or contact details.

`tests/` covers rules 2 through 5 against a real in memory Postgres.

## Accounting model

Accrual basis. Revenue is recognized when an invoice is issued.

| Action | Debit | Credit |
| --- | --- | --- |
| Issue invoice | Accounts Receivable | Revenue account, tagged to team |
| Payment received | Cash (net), Processing Fees | Accounts Receivable |
| Void invoice | Revenue account | Accounts Receivable |
| Expense | Expense account, tagged to team | Cash |

The team tag on journal lines is what produces team level P&L. A cash basis
view can be added later as a report over the same journal.

## Integration layer

Three slots, one active adapter per club per slot:

| Slot | Works today | Contract written, not yet live |
| --- | --- | --- |
| Payments | Test payments (no money moves) | Stripe Connect |
| Accounting | CSV general ledger export | QuickBooks Online |
| Membership | Manual entry | Sport:80 |

Interfaces are in `integrations/types.ts`. `registry.ts` picks the adapter:
the club's row in the `integrations` table, else the environment variable,
else the built in default. Each planned adapter file lists the exact steps to
finish it.

Two extension points serve everything else:

- **Outbound:** `subscribe("payment.succeeded", handler)` in the event bus.
  Events are also stored in `event_log`, which doubles as the audit trail.
- **Inbound:** `POST /api/webhooks/{provider}`. The adapter verifies and
  translates; the route hands a clean event to the domain.

## Scale

Sized for one club and about twenty users, with headroom. On hosted Postgres
the same code serves many clubs. What to revisit as it grows:

- The embedded local database is single process. It is for development and
  demos. Use `DATABASE_URL` for anything shared.
- Event subscribers run in process. Move to a queue when an integration makes
  slow outbound calls.
- Report queries aggregate the journal live. Fine into the hundreds of
  thousands of lines; add period snapshots after that.

## Deliberately not built yet

| Gap | Why it waits |
| --- | --- |
| Live card payments | Needs a Stripe account and Connect onboarding |
| Messaging | SafeSport rules on adult to minor contact need design first |
| Video upload and timestamped comments | Storage cost; links prove the workflow |
| Bank reconciliation, refunds, partial pay by parents | After discovery confirms finance is a top three pain |
| Password reset and invitations | Needs an email provider. Club sign up exists (`domain/onboarding.ts`); coaches and parents cannot join a new club until invites ship |
| Club switcher | One user, one club for now; sign in picks the first membership |
| Editing and deleting records | Add per screen as pilots ask |
| Rate limiting on sign in | Add at the host or middleware before real users |
