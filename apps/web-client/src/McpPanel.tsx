import type { ClientMessage } from "@claude-in-browser-k8s/protocol";

export function McpPanel({ servers, onAdd }: {
  servers: { name: string; status: string }[];
  onAdd: (m: ClientMessage) => void;
}) {
  return (
    <aside className="mcp">
      <h3>MCP servers</h3>
      <ul>{servers.map((s) => (
        <li key={s.name}><span className={`dot ${s.status}`} /> {s.name} <em>{s.status}</em></li>
      ))}</ul>
      <form onSubmit={(e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const name = (f.elements.namedItem("name") as HTMLInputElement).value.trim();
        const url = (f.elements.namedItem("url") as HTMLInputElement).value.trim();
        if (name && url) { onAdd({ type: "mcp.add", name, server: { transport: "http", url } }); f.reset(); }
      }}>
        <input name="name" placeholder="name (e.g. fetch)" />
        <input name="url" placeholder="https://… (remote MCP URL)" />
        <button type="submit">Add</button>
      </form>
    </aside>
  );
}
