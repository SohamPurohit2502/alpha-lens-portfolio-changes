# Alpha Lens — Mutual Fund Portfolio Changes

[Open the live website](https://sohampurohit2502.github.io/alpha-lens-portfolio-changes/)

Alpha Lens is an interactive research dashboard focused on significant portfolio changes across selected actively managed Indian equity mutual funds.

## Features

- Refreshes the high-alpha fund selection using current NAV history
- Reloads the latest available portfolio disclosures for the selected funds
- Shows stock exposure across the available previous three to four months
- Tracks new positions, exits, weight increases, and weight reductions
- Sortable and filterable portfolio-change explorer
- Excel download containing the current explorer view and fund selection
- Responsive desktop and mobile interface

## Refresh methodology

The on-demand refresh revalidates a pre-screened candidate pool against current NAV history and the category medians from the most recent full-universe screen. It then retrieves the latest available portfolio disclosures and recalculates significant stock-level changes.

Material changes are defined as:

- New or exited position: at least 0.50% portfolio weight
- Existing position: absolute movement of at least 0.50 percentage points

Portfolio-weight changes can reflect both trading activity and market-price movement. Alpha Lens is a research screen and not investment advice.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The public frontend is hosted with GitHub Pages. Live refresh calculations run through a Netlify Function.
