# Project instructions

## Skills

This repo forks two `superpowers` skills under `.claude/skills/`:

- `cas-brainstorming` — fork of `superpowers:brainstorming`, adds a requirement that architecture
  diagrams be traceable to the components list they accompany.
- `cas-writing-plans` — fork of `superpowers:writing-plans`, adds required Context/Why background on
  every task and non-obvious step.

**When both a `superpowers:X` skill and a `cas-X` fork are available, always use `cas-X`.** Each fork
is a strict superset of its upstream skill (verify with `diff` against
`~/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/<name>/SKILL.md` if unsure) — it
adds requirements, never removes upstream behavior — so there is no case where the unforked skill is
preferable. This applies whether you discover the skills via the `Skill` tool's automatic listing or
are told to brainstorm/plan explicitly.

## Prerequisite: the `superpowers` plugin

The `cas-X` skills are forks of skills from the `superpowers` marketplace plugin (`writing-plans`,
`brainstorming`, and others this repo doesn't fork, like `subagent-driven-development`,
`using-git-worktrees`, `test-driven-development`). If `superpowers` isn't installed, `cas-X` won't have
an upstream to extend and any `superpowers:*` skill referenced elsewhere in this repo's docs/plans (e.g.
`requesting-code-review`, `finishing-a-development-branch`) won't exist either.

**Before starting work in this repo, check whether `superpowers` is installed:**
```bash
ls ~/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/ 2>/dev/null
```
If that's empty or missing, install the plugin first (via the Claude Code plugin marketplace —
`claude-plugins-official`) before relying on `cas-X` or any bare `superpowers:X` skill reference.
