// Vitest runs library code outside of Next.js's server/client bundle split,
// where the real `server-only` package unconditionally throws. Tests only
// exercise server-side code, so this alias (see vitest.config.ts) swaps in
// a no-op.
export {}
