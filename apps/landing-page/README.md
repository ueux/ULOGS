# ULogs Landing Page

Public Next.js (App Router) marketing site for [ULogs](https://ulogs.com): product story, features, integrations, pricing, waitlist, and Clerk-hosted sign-in/sign-up.

This app is part of the [ULogs monorepo](../../README.md). It holds no product data — authenticated functionality lives in [`apps/main-dashboard`](../main-dashboard/README.md), and every "Dashboard / Get Started / Billing" link on this site points there via an environment variable.

## Getting started

```bash
npm install
npm run dev     # http://localhost:3000
```

## Environment (`.env`)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser key |
| `CLERK_SECRET_KEY` | Clerk server key for the middleware/session checks |
| `NEXT_PUBLIC_DASHBOARD_URL` | Target of dashboard links (dev convention: `http://localhost:3001`) |

`NEXT_PUBLIC_DASHBOARD_URL` is consumed in `LandingHeader`, `LandingHero`, and `LandingCTA`; it falls back to `http://localhost:3001` when unset.

## Routes

| Path | Description |
| --- | --- |
| `/` | Marketing page: hero, story, features, integrations, pricing (`#pricing`), CTA |
| `/sign-in`, `/sign-up` | Clerk hosted auth components (`[[...rest]]` catch-all routes) |
| `/waitlist` | Clerk-based waitlist page |
| `/terms`, `/privacy` | Legal pages |

The header shows Log in / Get Started when signed out; when signed in it renders an avatar dropdown linking to the dashboard, billing, and settings plus a sign-out action.

## Middleware

> **This app runs a modified Next.js release: the middleware file is `proxy.ts`, not `middleware.ts`.** Framework docs live in `node_modules/next/dist/docs/`.

`proxy.ts` is a plain `clerkMiddleware()` with the default Next matcher (skips `_next` internals and static assets, always runs for `/api/*`).

## Scripts

```bash
npm run dev     # next dev
npm run build   # production build
npm run start   # serve production build
npm run lint    # eslint
```

## Notes

- Styling is Tailwind + shadcn-style components under `components/ui`; marketing sections live in `components/landing`.
- Keep secrets out of `NEXT_PUBLIC_*` variables; anything prefixed with it ships to the browser.
- Pricing tiers here should stay in sync with the Stripe prices configured in [`services/.env`](../../services/README.md#configuration-servicesenv).
