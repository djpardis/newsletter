/**
 * Preflight check that the deployed Worker matches local source before sending.
 *
 * The Worker stamps `DEPLOY_SHA` at deploy time (`npm run deploy`) and exposes
 * it at `GET /health`. Comparing that to the local `git HEAD` makes it
 * impossible to silently test or send against a stale deployment.
 */
import { execFileSync } from "node:child_process";

interface GitState {
  sha: string | null;
  dirty: boolean;
}

function localGitState(): GitState {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    const dirty =
      execFileSync("git", ["status", "--porcelain"], {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim().length > 0;
    return { sha: sha || null, dirty };
  } catch {
    return { sha: null, dirty: false };
  }
}

function shaMatches(local: string, live: string): boolean {
  if (live === "unknown" || !live) return false;
  return local === live || local.startsWith(live) || live.startsWith(local);
}

async function liveSha(base: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { sha?: string };
    return typeof json.sha === "string" ? json.sha : null;
  } catch {
    return null;
  }
}

/**
 * Verifies the deployed Worker is built from the current commit. Exits the
 * process with a clear, actionable message when it is stale, unless `skip` is
 * set. Unverifiable conditions (no git, unreachable Worker) warn and continue.
 */
export async function assertWorkerUpToDate(
  base: string,
  opts: { skip?: boolean } = {},
): Promise<void> {
  if (opts.skip) {
    console.error("⚠️  Skipping deploy version check (--skip-version-check).");
    return;
  }

  const { sha: local, dirty } = localGitState();
  if (!local) {
    console.error("⚠️  Could not read local git HEAD; skipping version check.");
    return;
  }

  const live = await liveSha(base);
  if (live === null) {
    console.error(`⚠️  Could not read ${base}/health; skipping version check.`);
    return;
  }

  if (!shaMatches(local, live)) {
    console.error(
      [
        "",
        "✗ Deployed Worker is out of date.",
        `    deployed: ${live}`,
        `    local HEAD: ${local}`,
        "",
        "  Deploy the current code first, e.g.:",
        "    WRANGLER_CONFIG=wrangler.<operator>.toml npm run deploy",
        "",
        "  Or re-run with --skip-version-check to send anyway.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  if (dirty) {
    console.error(
      `⚠️  Working tree has uncommitted changes; deployed ${live} matches HEAD but not your local edits.`,
    );
  }
}
