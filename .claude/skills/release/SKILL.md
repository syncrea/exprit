---
name: release
description: Version and publish @syncrea/exprit and @syncrea/exprit-cli to npm with nx release. Use when asked to cut a release, bump the version, generate the changelog or publish. Publishing is outward-facing, so always dry-run first and get explicit confirmation.
---

# Release

`nx.json` configures `nx release` for the two public packages (`exprit`,
`cli`) in **lockstep**: one version number for both. Internal `@exprit/*`
libraries are private and bundled, so they are never published.

## Prerequisites (one-time)

- The npm org `syncrea` exists and the publishing user belongs to it.
  `npm whoami` and `npm org ls syncrea` both work.
- Both packages set `"publishConfig": { "access": "public" }`, so the first
  publish of a scoped package needs no `--access public` flag.
- The git working tree is clean and the branch is up to date.

## Steps

1. `pnpm check`. Everything must be green, including conformance.
2. Dry run, which changes nothing:
   `pnpm nx release --dry-run` (add `--first-release` the first time; there is no
   tag yet). Version bumps come from conventional commits (`feat:` is minor,
   `fix:` is patch, `!`/`BREAKING CHANGE` is major). Publishing depends on `build`, so the packages are rebuilt after the version bump.
3. Show the user the planned version, the changelog and the files.
   **Stop and ask for confirmation.** Publishing cannot be undone.
4. On confirmation: `pnpm nx release` (with `--first-release` if needed).
   It bumps `package.json` versions, rewrites `workspace:*` to the real version
   on publish, writes `CHANGELOG.md`, commits `chore(release): publish x.y.z`,
   tags `vX.Y.Z`, and publishes. Pushing the commit and tag is a separate,
   explicit step: `git push --follow-tags`.

## If something fails mid-way

- Version and tag created, publish failed: fix the cause, then
  `pnpm nx release publish`. Do not bump again.
- Never `npm unpublish` without the user's explicit instruction.
