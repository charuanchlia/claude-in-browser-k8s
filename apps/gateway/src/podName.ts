/** Map a username to a deterministic, DNS-1123-safe pod name. */
export function podName(username: string): string {
  const slug = username.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `agent-${slug}`.slice(0, 63).replace(/-+$/g, "");
}
