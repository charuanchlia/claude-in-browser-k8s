import { createSession } from "./src/index.js";
// NOTE: cwd deliberately points at an isolated scratch dir, not process.cwd(),
// because this session runs with bypassPermissions (no approval prompts) and
// this smoke test executes directly on the host machine, not inside a pod.
const s = createSession((e) => console.log(JSON.stringify(e)), {
  cwd: "/private/tmp/claude-501/-Users-charu-Desktop-code-learningai-agenticharness/73a0c430-9564-4839-b33d-6bb92886fb2f/scratchpad/smoke-cwd",
});
s.sendPrompt("Reply with exactly: SESSION_OK");
setTimeout(() => s.dispose(), 30000);
