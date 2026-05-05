# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Validation**: Zod (`zod/v4`)
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Landing Page
- Static investor/buildathon landing page at `artifacts/empathiq/public/landing.html`
- Served directly by Vite's static file server at `/landing.html`
- Single-file HTML with embedded CSS+JS — no build step required
- Sections: Hero (typewriter + gradient orbs + live emotion chip), Problem, How It Works, Features, Vision, Built By, CTA Footer
- Typography: DM Serif Display + DM Sans (Google Fonts)
