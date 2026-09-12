import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { invokeAntigravity } from "../plugins/ask-antigravity/scripts/lib/agy.mjs";
import { invokeStaticReview } from "../plugins/ask-antigravity/scripts/lib/static-review.mjs";

// Replace only the external CLI; exercise real capture, parsing, diagnostics,
// exit handling and temporary-directory cleanup in both transports.
function fakeAgy(t, { diagnostic, status = 7, answer = "" }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-diagnostic-test-"));
  const log = path.join(dir, "calls.jsonl");
  const previousPath = process.env.PATH;
  t.after(() => {
    process.env.PATH = previousPath;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(dir, "agy"), `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({args, cwd:process.cwd()}) + "\\n");
process.stderr.write(${JSON.stringify(diagnostic)});
const answer = ${JSON.stringify(answer)};
if (answer) process.stdout.write(args.includes("--input-format")
  ? JSON.stringify({event:"result", result:{status:"SUCCESS", response:answer}}) + "\\n"
  : answer);
process.exit(${status});
`, { mode: 0o755 });
  process.env.PATH = dir + path.delimiter + previousPath;
  return () => fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
}

const cases = [
  { name: "localhost bind denial", diagnostic: "listen tcp 127.0.0.1:9222: bind: operation not permitted\n", bind: true },
  { name: "ANSI listener denial", diagnostic: "Error: listen \x1b[31mEACCES\x1b[0m: permission denied ::1:9222\n", bind: true },
  { name: "runtime log denial", diagnostic: "open /Users/test/.gemini/antigravity-cli/log/cli.log: Operation not permitted\n", state: true },
  { name: "read-only session database", diagnostic: "EROFS: read-only file system, open '/home/test/.gemini/antigravity-cli/conversation_summaries.db'\n", state: true },
  { name: "both denials", diagnostic: "bind: permission denied\nsymlink /home/test/.gemini/antigravity-cli/cli.log: EACCES\n", bind: true, state: true },
  { name: "empty exit-zero failure", diagnostic: "bind: permission denied\n", status: 0, bind: true },
  { name: "nonempty failed output", diagnostic: "bind: permission denied\n", answer: "partial answer", bind: true },
  { name: "generic permission error", diagnostic: "Operation not permitted\n" },
  { name: "unrelated workspace denial", diagnostic: "EACCES: permission denied, open '/project/output.txt'\n" },
  { name: "listener word in a filename", diagnostic: "EACCES: permission denied, open '/project/listen/config'\n" },
  { name: "agy tool approval denial", diagnostic: 'a tool required the "command" permission; auto-denied\n' },
  { name: "authentication error", diagnostic: "HTTP 403: permission denied\n" },
  { name: "occupied port", diagnostic: "listen tcp 127.0.0.1:9222: bind: address already in use\n" },
  { name: "unrelated log lines", diagnostic: "Listening on localhost\nstate directory /home/test/.gemini/antigravity-cli/\nHTTP 403: permission denied\n" },
  { name: "successful response with warning", diagnostic: "bind: permission denied\n", status: 0, answer: "final answer", success: true }
];

for (const [transport, invoke] of [["task", invokeAntigravity], ["review", invokeStaticReview]]) {
  for (const scenario of cases) {
    test(`${transport}: ${scenario.name}`, async t => {
      const calls = fakeAgy(t, scenario);
      let out = "", err = "";
      const result = await invoke({ prompt: "test", write: false, isolateWorkspace: true,
        stdout: { write: text => { out += text; } },
        stderr: { write: text => { err += text; } } });
      assert.equal(result.status, scenario.success ? 0 : scenario.status === 0 ? 1 : 7);
      assert.ok(err.includes(scenario.diagnostic), "preserve the original stderr, including ANSI");
      const hint = err.slice(err.indexOf(scenario.diagnostic) + scenario.diagnostic.length);
      if (scenario.bind || scenario.state) {
        assert.match(hint, /host.*controls/);
        assert.match(hint, /rerun explicitly/);
        assert.equal(/socket binding/.test(hint), !!scenario.bind);
        assert.equal(/runtime state/.test(hint), !!scenario.state);
        assert.equal(/network/.test(hint), !!scenario.bind);
        assert.equal(/writable_roots/.test(hint), !!scenario.state);
        assert.doesNotMatch(hint, /--write|danger-full-access|dangerously-skip/);
      } else {
        assert.doesNotMatch(hint, /host.*controls|writable_roots|socket binding|runtime state/);
      }
      if (scenario.success) assert.match(out, /final answer/);
      const invocations = calls();
      assert.equal(invocations.length, 1, "never retry a denied request");
      assert.ok(!fs.existsSync(invocations[0].cwd), "remove the isolated workspace after failure or success");
      if (transport === "task") {
        const args = invocations[0].args;
        assert.ok(!fs.existsSync(args[args.indexOf("--add-dir") + 1]), "remove the prompt directory");
      }
    });
  }
}
