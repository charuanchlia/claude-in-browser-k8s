import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer } from "ws";
import type { ClientMessage, ServerMessage } from "@claude-in-browser-k8s/protocol";
import { podName } from "./podName.js";
import { ensurePod, deletePod, sweepStalePods } from "./podManager.js";
import { proxy } from "./proxy.js";

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_DIR = process.env.CLIENT_DIR ?? "/app/web-client/dist";

// --- static file server for the built React client ---
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
  const urlPath = (req.url ?? "/") === "/" ? "/index.html" : req.url!;
  const resolvedRoot = path.resolve(CLIENT_DIR);
  const file = path.resolve(resolvedRoot, "." + urlPath.split("?")[0]);
  const serveIndex = () => fs.readFile(path.join(resolvedRoot, "index.html"), (e2, idx) => { res.writeHead(e2 ? 404 : 200); res.end(e2 ? "not found" : idx); });
  if (file !== resolvedRoot && !file.startsWith(resolvedRoot + path.sep)) { serveIndex(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { serveIndex(); return; }
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    res.end(buf);
  });
});

// --- websocket: /ws ---
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (browser) => {
  const send = (m: ServerMessage) => browser.readyState === browser.OPEN && browser.send(JSON.stringify(m));
  let podNameStr: string | null = null;
  const pending: string[] = [];
  const bufferWhileStarting = (raw: Buffer | string) => { pending.push(raw.toString()); };

  browser.once("message", async (raw) => {
    let hello: ClientMessage;
    try { hello = JSON.parse(raw.toString()); } catch { browser.close(); return; }
    if (hello.type !== "hello" || !hello.username) { send({ type: "error", message: "expected hello{username}" }); browser.close(); return; }

    browser.on("message", bufferWhileStarting); // catch anything sent while we're spinning up

    podNameStr = podName(hello.username);
    send({ type: "session.status", state: "starting", detail: `spinning up ${podNameStr}` });
    try {
      const t0 = Date.now();
      const pod = await ensurePod(podNameStr);
      console.log(`cold-start ${podNameStr}: ${Date.now() - t0}ms`);
      browser.off("message", bufferWhileStarting);
      proxy(browser, `ws://${pod.ip}:8080`, () => { if (podNameStr) deletePod(podNameStr); }, pending);
    } catch (e) {
      browser.off("message", bufferWhileStarting);
      send({ type: "session.status", state: "error", detail: e instanceof Error ? e.message : String(e) });
      if (podNameStr) await deletePod(podNameStr);
      browser.close();
    }
  });
});

sweepStalePods().catch((e) => console.error("sweep failed:", e));
server.listen(PORT, () => console.log(`gateway listening on :${PORT}`));
