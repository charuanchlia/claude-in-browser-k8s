# Claude Code in the Browser, One Pod Per User — Design Spec

**Date:** 2026-07-18
**Status:** Draft for review
**Companion diagram:** https://claude.ai/code/artifact/71cab1cf-f7c8-4b34-9fcb-6b915319ed00

---

## 1. Goal

Run a Claude-Code-style agent (agentic loop + tools + MCP) that is:

1. Served to a **browser** UI instead of a terminal.
2. Executed **server-side in an isolated Kubernetes pod, one pod per user**, on a local `kind` cluster.
3. Factored so the *same loop* can later run as a **local Mac app** with no rewrite.

This is a learning-grade but honestly-architected prototype (goals **B + C** from brainstorming): the
per-user-pod isolation mechanic, built with clean boundaries that would survive growth. The trophy is:
open two browser tabs with two names, watch two pods spin up, chat with an agent that can run tools and
use MCP servers in each — and be able to explain and measure *where the latency goes*.

### Non-goals (explicitly cut)

- Real authentication (username only, no passwords/OIDC).
- Persistence — pods are ephemeral; no PVCs, no saved history.
- Idle-culling / pre-warm pools / autoscaling.
- Multi-node scheduling concerns (single-node `kind`).
- The Mac app itself (Shell B) — designed for, but built in a follow-up spec.
- Production credential isolation (we mount a token; the proxy upgrade is noted as future).

---

## 2. Decisions (locked in brainstorming)

| Area | Decision |
|---|---|
| Agent runtime | **Claude Agent SDK (TypeScript)** in the pod |
| Pod lifecycle | **Ephemeral** — created on connect, deleted on disconnect |
| Identity | **Typed username**, no auth. `username` → pod name |
| MCP | **Add-a-server box + live status panel** = a mini `/mcp` |
| Transport | **WebSocket** (tokens + control messages on one channel) |
| Pod creation | **Gateway calls the k8s API** with a scoped ServiceAccount |
| Packaging | **One shared `agent-core`, two shells** (pod now, Mac app later) |
| Credentials | **Claude subscription** long-lived token via `claude setup-token` → k8s Secret → `CLAUDE_CODE_OAUTH_TOKEN` env in pod. No API key. |
| First build | **Option A** — pod/browser path first; `agent-core` factored so Shell B is a small add |

**Verified facts (public docs, not leaked source):** the Claude Agent SDK is the same harness that
powers Claude Code, exposed as a library (renamed from "Claude Code SDK" ~March 2026). Claude Code on
the web runs each session in an isolated cloud sandbox. Our design mirrors that shape on `kind`.

---

## 3. Architecture

Three tiers plus a shared core. The browser is a dumb terminal; the gateway routes and mints pods;
the pod runs everything real.

```
Browser (React)  ──WS──►  Gateway pod  ──k8s API──►  create/delete per-user Pod
      ▲                        │                              │
      └──────proxied WS────────┴──────────────────────────►  Agent pod
                                                              runs agent-core
                                                              ├─ Agent SDK loop
                                                              ├─ tools (shell/files)
                                                              ├─ MCP clients
                                                              └─ CLAUDE_CODE_OAUTH_TOKEN ─► Anthropic API
```

### 3.1 Component: `agent-core` (shared package)

The loop, with **no knowledge of transport, HTTP, browsers, or k8s**. This is the piece both the pod
shell and the future Mac shell reuse.

- **Responsibility:** wrap the Claude Agent SDK — run the agentic loop, execute built-in tools, manage
  MCP client connections.
- **Interface (shape; exact SDK calls confirmed during Task 1):**
  - `createSession(opts: { mcpServers?: McpConfig[] }): Session`
  - `session.sendPrompt(text: string): void`
  - `session.on(event, cb)` — events: `token`, `tool_call`, `tool_result`, `mcp_status`, `done`, `error`
  - `session.addMcpServer(cfg: McpConfig): Promise<McpStatus>`
  - `session.listMcp(): McpStatus[]`
  - `session.dispose(): void`
- **Depends on:** `@anthropic-ai/claude-agent-sdk` (TS), the ambient credential env var.
- **Testable alone:** yes — instantiate, send a prompt, assert event stream. No network mocking needed
  for the interface tests beyond the SDK boundary.

### 3.2 Component: Shell A — pod server

- **Responsibility:** wrap one `agent-core` session in a WebSocket server; translate WS messages ↔ core
  events. One process = one user's session (pod is single-tenant).
- **Interface:** the WebSocket protocol in §4.
- **Runs in:** the per-user agent pod (the pod image's entrypoint).
- **Depends on:** `agent-core`, a WS library (`ws`).

### 3.3 Component: Gateway / control plane

- **Responsibility:**
  1. Serve the React client (static files).
  2. Accept a browser WebSocket, read `username`.
  3. Look up / create that user's pod via the k8s API (`create Pod`, wait for Ready).
  4. Proxy the browser WS to the pod's WS.
  5. On browser disconnect, `delete Pod`.
- **Interface:** HTTP (static + WS upgrade) to the browser; k8s API (client-go/JS client) inward.
- **Runs in:** a single shared gateway pod.
- **Depends on:** a **ServiceAccount** with RBAC limited to `create/get/list/delete pods` in one
  namespace; the k8s JS client.
- **Pod naming:** `agent-<sanitized-username>` for idempotent lookup (reconnect finds/reuses or recreates).

### 3.4 Component: React client

- **Responsibility:** username entry → chat UI → stream rendering → the mini-`/mcp` panel (list/add/status).
- **Interface:** one WebSocket to the gateway; the §4 protocol.
- **Depends on:** nothing privileged. No key, no tools.

### 3.5 Component: pod image

- Base: node:24-slim. Contains `agent-core` + Shell A + one baked-in known-good **stdio MCP server**
  (e.g. a filesystem MCP) so MCP works out of the box; remote-URL MCPs are added at runtime via the box.
- Loaded into `kind` via `kind load docker-image`.

### 3.6 Kubernetes resources

- One `kind` cluster, one namespace (e.g. `claude-lab`).
- `Deployment` + `Service` for the gateway (NodePort or port-forward for browser access).
- `ServiceAccount` + `Role` + `RoleBinding` (least privilege, pods only, one namespace).
- `Secret` holding the subscription token; referenced by per-user pods as `CLAUDE_CODE_OAUTH_TOKEN`.
- Per-user `Pod` spec (created dynamically by the gateway) with CPU/memory limits.

---

## 4. WebSocket protocol (browser ↔ gateway ↔ pod)

JSON messages, one channel. Gateway proxies transparently once the pod is ready.

**Client → server**
```
{ "type": "hello", "username": "charu" }
{ "type": "prompt", "text": "..." }
{ "type": "mcp.add", "server": { "name": "...", "transport": "http", "url": "..." } }
{ "type": "mcp.list" }
{ "type": "mcp.reconnect", "name": "..." } | { "type": "mcp.disable", "name": "..." }
```

**Server → client**
```
{ "type": "session.status", "state": "starting|ready|error", "detail": "..." }  // incl. cold-start
{ "type": "token", "text": "..." }               // streamed model output
{ "type": "tool_call", "name": "Bash", "input": {...} }
{ "type": "tool_result", "name": "Bash", "ok": true }
{ "type": "mcp.status", "servers": [ { "name": "...", "state": "connected|failed|disabled", "tools": 5 } ] }
{ "type": "done" }
{ "type": "error", "message": "..." }
```

The `mcp.status` message drives the mini-`/mcp` panel. `session.status: starting` is where the browser
shows "spinning up your environment" during pod cold-start.

---

## 5. Data / control flow (one session)

1. Browser connects, sends `hello{username}`.
2. Gateway computes pod name, `create Pod`, waits Ready (emits `session.status: starting` → `ready`).
3. Gateway dials the pod's WS, proxies both directions.
4. Browser `prompt` → pod → `agent-core` loop → `token`/`tool_call`/`tool_result` stream back.
5. `mcp.add` → pod re-inits the session with the new server → `mcp.status` back.
6. Browser closes → gateway `delete Pod`.

---

## 6. Error handling

- **Pod fails to become Ready** (timeout): gateway emits `session.status: error`, deletes the partial
  pod, closes the WS with a reason. Client shows a retry.
- **Auth failure in pod** (token invalid/expired): pod emits `error` with a clear message ("subscription
  token rejected — regenerate with `claude setup-token`"); does not crash-loop silently.
- **MCP connect failure:** reported per-server as `state: failed` in `mcp.status`; the session stays
  usable, matching how `/mcp` shows a failed server without killing Claude Code.
- **Browser disconnect mid-loop:** gateway deletes the pod; in-flight work is discarded (acceptable for
  ephemeral). No orphan pods — deletion is the disconnect handler, plus a startup sweep of stale
  `agent-*` pods as a safety net.
- **k8s API errors:** surfaced as `session.status: error` with the API message; never swallowed.

---

## 7. Security notes

- **Least-privilege ServiceAccount:** gateway can only CRUD pods in one namespace — nothing else.
- **Token as Secret:** the subscription token is a k8s Secret, mounted as env only into agent pods.
- **Known gap (intentional):** the token sits *inside* the pod. Anthropic's real product keeps
  credentials *outside* the sandbox and proxies model calls. The honest production upgrade is a
  **credential-proxy at the gateway** — noted as a future chapter, not built now.
- **Pod resource limits:** cap CPU/memory so one user's runaway loop can't starve the node.

---

## 8. Testing strategy

- **`agent-core`:** unit tests against the interface — create session, send prompt, assert the event
  stream; add an MCP server, assert `mcp_status`. This is the highest-value test surface.
- **Shell A (pod server):** protocol tests — feed WS messages, assert core is driven and events are
  serialized back.
- **Gateway:** test pod-name derivation, the create→ready→proxy→delete lifecycle against a fake k8s
  client, and the stale-pod sweep.
- **End-to-end (manual, on `kind`):** two tabs / two names → two pods (`kubectl get pods -w`), a prompt
  that runs a tool, an added MCP server appearing in the panel, and clean pod deletion on tab close.

---

## 9. Latency measurement plan (the point of the exercise)

Instrument and record three numbers, then compare browser-served vs local:

1. **Pod cold-start** — `create Pod` → WS ready (paid once per ephemeral session).
2. **In-cluster hop** — browser→gateway→pod round-trip for a trivial control message.
3. **Model-call latency** — pod→Anthropic first-token and full-response.

Expected finding to validate: (2) is negligible on `kind`; (3) dominates and equals terminal Claude
Code; (1) is the only new cost the browser architecture introduces — the thing a future pre-warm pool
would attack. When Shell B (Mac app) exists, rerun (3) locally to confirm it's apples-to-apples.

---

## 10. Build order (Option A) — informs the implementation plan

1. **Spike: headless subscription auth in a pod. ✅ DONE (2026-07-18).** Verified `claude -p` runs
   headless in a clean `node:24-slim` container with only `CLAUDE_CODE_OAUTH_TOKEN` (from
   `claude setup-token`) — no Keychain, no API key. Returned `CONTAINER_AUTH_OK`. The credential path
   in §7 is validated.
2. `agent-core` package + tests (loop, events, MCP).
3. Shell A (pod server) + pod image + `kind load`.
4. Gateway (pod lifecycle + WS proxy + RBAC).
5. React client (chat + mini-`/mcp` panel).
6. End-to-end on `kind`; add latency instrumentation.

**Deferred to follow-up specs:** Shell B (Mac app), persistence (PVCs), pre-warm pool, real auth,
credential proxy.

---

## 11. Open assumptions

- ~~The subscription long-lived token works headless in a Linux pod via `CLAUDE_CODE_OAUTH_TOKEN`~~
  **Validated 2026-07-18** (see §10 Task 1). Token is long-lived, so we regenerate via
  `claude setup-token` if/when it expires.
- Exact Agent SDK method/option names (esp. how `mcpServers` is passed and how streaming events are
  surfaced) are confirmed against the installed SDK during Task 2, not quoted from memory here.
