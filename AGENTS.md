<!-- BEGIN:nextjs-agent-rules -->
# ⚠️ CRITICAL: This is NOT the Next.js you know

**Next.js 16.2.6** has breaking changes. APIs, conventions, and file structure differ from your training data.
**MUST READ** before writing any code: `node_modules/next/dist/docs/`

## Key Breaking Changes in Next.js 16

| Change | Impact | Example |
|--------|--------|---------|
| **`params` is async Promise** | Must `await params` in routes | `const { id } = await params` |
| **`cookies()` is async** | Always `await cookies()` in Server Components | `const cookieStore = await cookies()` |
| **`headers()` is async** | Always `await headers()` | `const headersList = await headers()` |
| **No `NextResponse` — use Web API `Response`** | Return `Response.json()` not `NextResponse.json()` | `return Response.json({ data })` |
| **Client Components require explicit 'use client'** | Hydration errors if missing on interactive components | `'use client'` at top of file |

## Node.js Constraint

- **Node 22 LTS: REQUIRED** (for performance, Rust Prisma engine)
- **Node 24+: BLOCKED** — V8 fatal error in `Readable.toWeb()` (sequential parse memory leak)
  - `npm run dev` checks `node --version` and exits if >= 24
  - Workaround for telemetry: use manual `ReadableStream` adapter (see CLAUDE.md)

## Quick Start

1. **Dev Server** — Requires 8GB heap (webpack in-memory cache is intensive)
   ```bash
   npm run dev
   ```

2. **Database** — Single Prisma client instance reused per process
   ```bash
   DATABASE_URL=mysql://root:pass@localhost/pubg_clan_site npm run dev
   ```

3. **Environment Setup** — See [dev-setup.md](docs/ops/dev-setup.md) for Windows/VSCode

4. **Key Commands**
   - `npm run telemetry:worker` — Infinite telemetry resync worker (512MB memory limit)
   - `npm run telemetry:batch -- --clan 1 --all-matches` — Enqueue batch jobs from CLI
   - `npm run build` — Production standalone build (+ copies assets post-build)

## Architecture at a Glance

```
Async Server Components (app/layout.tsx)
    ↓ session validation via cookies()
Proxy Guard (src/proxy.ts, edge runtime)
    ↓ routes based on setupState
Client Pages ('use client', data-driven)
    ↓ fetch via custom hooks (useLeaderboard, usePlayerStats, etc.)
API Routes (app/api/**/route.ts)
    ↓ standard Response.json(), MUST await params
Prisma (singleton, MySQL)
    ↓ 31 models (Clan, Member, Stats, Telemetry, etc.)
```

See [CLAUDE.md](CLAUDE.md) for full patterns, UI system, and gotchas.

<!-- END:nextjs-agent-rules -->
