@AGENTS.md

## Claude Code specifics

- Project skills in `.claude/skills/` (`extend-grammar`, `add-builtin`,
  `conformance`, `release`) hold the playbooks for recurring tasks. Invoke the
  matching skill before starting such a task.
- The `sandbox-reviewer` subagent (`.claude/agents/sandbox-reviewer.md`)
  reviews changes to the evaluator, member access, registry or globals for
  sandbox escapes. Run it before finishing any change in those areas.
- `.claude/settings.json` formats every edited file with Prettier
  automatically (PostToolUse hook). It denies edits to the vendored
  conformance files, and asks before editing `docs/typescript.md` or releasing.
