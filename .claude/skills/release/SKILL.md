---
name: release
description: Version and publish @syncrea/exprit and @syncrea/exprit-cli. The full nx release (version, changelog, commit, tag, push, GitHub release, npm publish with provenance) runs in the Release GitHub Actions workflow after a manual approval. Use when asked to cut a release, bump the version, generate the changelog or publish. Publishing is outward-facing, so always dry-run first and get explicit confirmation.
---

# Release

`nx.json` configures `nx release` for the two public packages (`exprit`,
`cli`) in **lockstep**: one version number for both. Internal `@exprit/*`
libraries are private and bundled, so they are never published.

Releases run in `.github/workflows/release.yml`, never on a developer
machine. The workflow runs the whole `nx release`: version bump (from
conventional commits, or an explicit specifier), `CHANGELOG.md`, the
`chore(release): publish x.y.z` commit, the `vX.Y.Z` tag, push to `origin`,
the GitHub release, and the npm publish. npm authenticates the workflow via
OIDC trusted publishing, so no npm token or OTP is involved and npm attaches
provenance automatically. Afterwards it redeploys the docs site.

Every run waits for approval at the `release` environment, and it only
releases `main`'s tip when CI passed for it.

## Two ways to start a release

- **Approve a pending run.** After every green CI run on `main`, a Release run
  starts and waits. Approving it ("Review deployments" → `release` →
  Approve) releases that commit with the version derived from conventional
  commits (`feat:` minor, `fix:` patch, `!`/`BREAKING CHANGE` major). Pending
  runs that are never approved expire on their own.
- **Run it manually.** Actions → Release → Run workflow, with `specifier`
  (empty, `patch`, `minor`, `major`, `prerelease`, or an exact version such as
  `1.0.0`) and `dry-run`. It also waits for approval.

## Steps when asked to release

1. Make sure `main` is pushed and its CI run passed.
2. Preview locally, which changes nothing:
   `pnpm nx release [specifier] --dry-run --yes`. Show the user the planned
   version and changelog. A `docs:` or `chore:` commit alone does not bump the
   version; nothing is released then.
3. **Stop and ask for confirmation.** Publishing cannot be undone.
4. The user approves the pending Release run, or starts the workflow
   manually. Watch it in the Actions tab, then confirm on npm that both
   packages show the new version with a provenance badge.

## Prerequisites (one-time, done by the maintainer)

- GitHub: Settings → Environments → `release`, with the maintainer as a
  required reviewer, and deployments limited to `main`.
- npm, for each package: Settings → Trusted publishing → GitHub Actions,
  repository `syncrea/exprit`, workflow `release.yml`, environment `release`.
  A new configuration must be used for a first publish within 2 days, or it
  expires.
- `repository.url` in both `package.json` files stays exactly
  `git+https://github.com/syncrea/exprit.git`. npm compares it.
- If `main` gets branch protection, allow GitHub Actions to push the release
  commit, or the push step fails.

## If something fails

- Before the push (main moved, CI not green, invalid specifier): fix the cause
  and start again.
- After the push, during publishing: the commit and tag exist, so don't
  start a normal release again. Run the workflow manually with
  `publish-only`: it publishes the version tagged on `main`'s tip, and
  `nx release publish` skips a package whose version is already on npm.
- Never `npm unpublish` without the user's explicit instruction.
