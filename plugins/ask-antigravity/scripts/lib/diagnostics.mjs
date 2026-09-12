import { stripAnsi } from "./process.mjs";

// Classify only contextual OS denials from stderr, never model output. Keep
// evidence on the same line so an unrelated permission error cannot turn an
// earlier listener/state-path announcement into a purported host denial.
// This is a hint about denied access, not proof of a sandbox or startup cause.
export function explainHostDenial(stderr = "") {
  const lines = stripAnsi(stderr).split(/\r?\n/).filter(line =>
    /operation not permitted|permission denied|read-only file system|\b(?:EPERM|EACCES|EROFS)\b/i.test(line));
  const binding = lines.some(line => /(?:^|[\s:])(?:bind|binding|listen|listening)(?=[\s:]|$)/i.test(line));
  const state = lines.some(line => /\.gemini[\\/]antigravity-cli(?:[\\/]|[\s'":]|$)/i.test(line));
  if (!binding && !state) return "";

  const denied = [];
  const settings = [];
  if (binding) {
    denied.push("socket binding");
    settings.push("effective network policy (including local networking)");
  }
  if (state) {
    denied.push("access to agy runtime state");
    settings.push("sandbox_workspace_write.writable_roots for ~/.gemini/antigravity-cli/");
  }
  return `agy reported denied ${denied.join(" and ")}. See the original diagnostic above.\n` +
    "Configure the required access through your host's controls, then rerun explicitly. " +
    `In Codex, check ${settings.join(" and ")}; enclosing or managed restrictions may still apply.\n`;
}
