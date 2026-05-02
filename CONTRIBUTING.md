# Contributing

Thanks for your interest. Patches and issues are welcome.

## Workflow

1. Open an issue first for anything non-trivial so we can agree on direction.
2. Fork and create a branch from `main` (e.g. `fix/<topic>`, `feat/<topic>`).
3. Make focused commits. Run the local checks below — CI runs the same set.
4. Open a pull request with a short description of the change and any operator-facing impact (new env vars, migrations, breaking API changes).

## Local checks

```bash
npm install
npm run typecheck
npm run lint
npm test
```

## Compatibility expectations

- The HTTP API (`/api/*`) and Worker `Env` variable names are public surface. Don't break them in a patch release. Additive changes are fine.
- Database migrations must be forward-only. Add a new file under `migrations/`; never edit an applied one.
- Email templates and headers (`List-Unsubscribe`, `List-Unsubscribe-Post`) must keep RFC 8058 compliance.

## Style

- TypeScript, ES modules. No new runtime dependencies without discussion — the Worker is intentionally small.
- Tests live next to the code (`*.test.ts`). Add coverage for new behavior.
- Don't commit secrets or environment-specific values to `wrangler.toml` (`[vars]`). Use `wrangler secret put` and the dashboard.
