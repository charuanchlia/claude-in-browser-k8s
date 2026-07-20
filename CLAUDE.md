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

## Architecture/design docs: use the Artifact tool, then mirror to Markdown

When producing an architecture or design diagram/doc for this repo (e.g. in response to "show me the
architecture," "let's see a diagram," or similar), use the **`Artifact` tool** — a built-in Claude Code
capability (not a `superpowers` skill) that publishes a shareable, styled HTML page. Before writing the
page content, load the **`artifact-design`** skill first (also built-in, not from `superpowers`) — it
governs palette, typography, and light/dark theming so the result doesn't look templated.

**If that HTML is then saved into this repo as a file (e.g. `docs/architecture.html`), it must also get
a Markdown sibling with the same content, in the same commit:**

1. Extract every `<pre class="mermaid">…</pre>` block from the HTML into its own diagram.
2. Render each one to a PNG. Prefer `https://mermaid.ink/img/<base64url(json.dumps({"code":...,
   "mermaid":{"theme":"neutral"}}))>?bgColor=white` (no local install, fast, reliable) over the local
   `@mermaid-js/mermaid-cli` — the latter's first-run Puppeteer/Chromium download has been unreliably
   slow in this environment. Save the PNGs under `docs/diagrams/`.
3. Write `docs/<name>.md` — the same headings/prose as the HTML, condensed to plain Markdown (tables
   instead of styled `.tiers` grids, blockquotes instead of `.callout` boxes), with each diagram
   embedded as `![...](diagrams/<name>.png)` in place of its mermaid block.
4. The `.html` file stays too — it's for local viewing (VS Code Simple Browser, any browser) since
   GitHub's default file view doesn't execute the mermaid-rendering `<script>` it contains. The `.md`
   file is what actually renders inline on GitHub, in the terminal, and anywhere else that reads
   Markdown but not arbitrary HTML+JS.

**Why both files, not just one:** the HTML is disposable/regenerable (it's a copy of an Artifact
publish) and needs a live renderer to view; the Markdown is what's actually readable in the places this
repo gets read — GitHub's web UI, `cat`/`less` in a terminal, a README link. Keeping both in sync means
neither audience is stuck with a worse version.
