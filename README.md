# Alpha Lens — Mutual Fund Portfolio Changes

Alpha Lens is an interactive research dashboard focused exclusively on material portfolio changes across selected actively managed Indian equity mutual funds.

## What it includes

- 332 material stock-level portfolio moves across 12 selected funds
- New positions, exited positions, weight increases, and weight reductions
- Four-month holding-weight paths from April to July 2026
- Fund activity ranking and largest-conviction signals
- Search, fund filters, move-type filters, sorting, and progressive row loading
- Responsive desktop and mobile layouts

## Materiality rules

- New or exited holding: at least 0.50% portfolio weight
- Existing holding: absolute April-to-July movement of at least 0.50 percentage points

Weight changes can reflect both portfolio transactions and market-price movement. The dashboard is a research screen, not investment advice.

## Local development

```bash
pnpm install
pnpm dev
```

## Production build

```bash
pnpm build
```

Built with React, vinext, Vite, and the OpenAI Sites runtime.
