// Vitest runs in plain Node, not through Next.js's webpack/turbopack build,
// so the bare `"server-only"` specifier (which Next resolves internally to
// a throw-on-client-bundle stub) doesn't resolve at all under Vitest.
// vitest.config.ts aliases "server-only" to this no-op instead — it's not
// asserting anything about server/client safety, just letting
// otherwise-pure modules that happen to start with `import "server-only"`
// load in tests.
export {};
