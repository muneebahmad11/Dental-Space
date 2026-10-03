# Runtime and package versions

Versions resolved from the npm registry during T001. Direct dependencies use exact versions; `pnpm-lock.yaml` pins transitive dependencies. CI uses frozen installation.

| Tool | Version |
| --- | --- |
| Node.js (development/CI target) | 24.21.0 |
| pnpm | 10.12.4 |
| Next.js / eslint-config-next | 16.3.6 |
| React / React DOM | 19.3.0 |
| TypeScript | 5.9.3 |
| Tailwind CSS / PostCSS adapter | 4.3.3 |
| ESLint | 9.39.5 |

The complete direct package list is in `package.json`. shadcn is locally owned component source configured through `components.json`, using Radix Slot, CVA and Tailwind utilities.

## Compatibility notes

- The available TypeScript 7 release exceeds the installed TypeScript ESLint parser's supported range. Keep TypeScript 5.9.3 until the lint integration supports an upgrade.
- ESLint 10 exceeds peer ranges of the React/import/accessibility plugins used by Next.js. ESLint 9.39.5 is compatible but carries an upstream end-of-support notice. Revisit this tooling dependency when those plugins support ESLint 10.
- pnpm skipped the optional `unrs-resolver` install script. Confirm lint resolves successfully before enabling additional install scripts.
- Development and production builds explicitly use the supported Webpack compiler. Turbopack's CSS subprocess failed to bind a local port on this host, including an elevated retry.
- Runtime configuration follows the [Next.js installation guidance](https://nextjs.org/docs/app/getting-started/installation); component configuration follows [shadcn manual installation](https://ui.shadcn.com/docs/installation/manual).

## Database foundation packages

Drizzle ORM 0.45.3, Drizzle Kit 0.31.11, Postgres.js 3.4.9, Zod 4.6.5, server-only 0.0.1 and @next/env 16.3.6 are pinned in package.json and the lockfile. Drizzle's transitive esbuild lifecycle script was not enabled; offline migration generation still succeeded with the installed platform binary. Local/CI PostgreSQL image is pinned to 17.6-alpine for a repeatable development environment and is not a production recommendation.

Native development PostgreSQL is now Homebrew 17.11; the optional Compose/CI image remains 17.6-alpine. Supabase SSR 0.12.7 and supabase-js 2.117.2 are pinned for the prepared staff authentication path. Hosted Auth connectivity remains unverified.
