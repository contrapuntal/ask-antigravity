# Codex 1.2.0 validation

Validated on macOS with Codex CLI 0.153.4 and Antigravity CLI 1.1.27 on 2026-09-06.

## Automated checks

- `npm test`: 148 tests, 143 passed, 5 opt-in live tests skipped, on Node 26.8.1.
- Node 22.22.2: the same 143 passes and 5 skips.
- Packaging tests copy only the installable directory, use a symlinked cache path containing spaces, unset `ANTIGRAVITY_CLI_PLUGIN_CC_ROOT`, and run the dispatcher against a separate Git repository.
- SIGINT and SIGTERM tests verify exit codes 130/143, termination of the fake agy child and grandchild, and removal of prompt/probe directories.
- Setup tests cover local-only probing, live JSON output, missing/unsupported binaries, tool denial, unexpected responses, and nonzero service failures.
- Existing CI retains Linux/macOS with Node 18/20/22. Linux and Node 18/20 were not executed locally during this validation.

## Real Codex smoke test

Installed from a temporary repository marketplace using `codex plugin marketplace add` and `codex plugin add`. A fresh Codex session read the four installed skills and invoked the cached companion against a disposable repository containing an intentionally incorrect arithmetic function.

- Setup with `--live --json`: passed; a real model response was verified.
- Review: passed; identified the incorrect subtraction operator.
- Adversarial review: passed; gave the failing arithmetic example.
- Analysis rescue: correctly failed with a headless `command` permission denial from agy; no answer and no file changes. Successful repository analysis requires an appropriate existing agy tool allowlist. The test did not change that allowlist or retry with broader access.
- Explicitly authorized write rescue: passed; changed only the requested operator. Three arithmetic checks passed and the fixture returned to its clean baseline.
- Long calls were polled through the foreground Codex session until exit.

The live test needed network access and write access to agy's config/log directory. A separate run under the outer restricted sandbox failed clearly because log writes and localhost socket binding were denied; this did not get mistaken for authenticated readiness.

The local plugin-creator validator hardcodes `skills/` and rejects the custom `codex-skills/` path. Actual Codex installation accepts that path. All four native skill files pass the skill validator. `commands: []` disables Codex's otherwise automatic migration of the bundled Claude setup command; Claude retains its own commands. A second fresh Codex session confirmed exactly the four native skills and no `source-command-setup` entry. The temporary plugin and marketplace were removed after verification.


## Opus review verification

Follow-up verification reproduced the completed-child cancellation race with a real child process whose descendant retained stdout. It also demonstrated that the old SIGKILL-only cancellation prevented a SIGTERM cleanup handler from running. The fixes preserve an exit observed before cancellation, allow two seconds for graceful group shutdown before SIGKILL, and still classify a child that exits zero *after* cancellation as cancelled. Exact CLI cancellation exit codes remain 130/143; the process helper no longer changes its caller's global exit code. Timeouts retain their own diagnostic when a later cancellation arrives.

Live setup now passes a 90-second print timeout to agy and imposes a 120-second hard limit. Regression tests exercise a shorter adapter deadline without waiting minutes. Normal reviews retain their 10-minute print timeout and 12-minute hard limit. A real `setup --live --json` call with agy 1.1.27 passed after these changes (`live.ok: true`, exit 0).

Live text rendering now has tests for success, denial, missing/unsupported runtime, and valid live readiness despite absent heuristic credentials. Missing/unsupported setup already printed an error consistent with exit 1; it now also explicitly says the live check was not run. The JSON authentication fields retain their existing heuristic meaning; the setup skill explains why a successful live check can override them for readiness.

The symlink fallback path is correct: official [Codex skill documentation](https://learn.chatgpt.com/docs/build-skills) lists `$HOME/.agents/skills` and explicitly supports symlinked folders. No path rollback is needed. A separate live test of that legacy fallback was not performed; native installation and symlinked cached runtime execution were already verified above.

## Gemini Flash static review transport

The prior file-based review asked Gemini 3.8 Flash (High) to inspect a nonexistent checkout and run `pwd && git status`. Headless agy denied `RunCommand`, then emitted a structured `SUCCESS` result with an empty response and `denied_actions`. A process exit of zero alone did not indicate a completed review.

Review and adversarial review now use stream-json stdin ([introduced in agy 1.1.15](https://github.com/google-antigravity/antigravity-cli/releases/tag/1.1.15)) with all diff context in the request, slash expansion disabled, and explicit static-only instructions. The parser requires exactly one successful nonempty final result and reports tool errors/denials, including command text when provided. Rescue and setup retain their existing transport and minimum version.

On agy 1.1.27, the updated companion with `--model 'Gemini 3.8 Flash (High)'` identified the subtraction regression in a disposable Git repository. A full-diff transport diagnostic returned a completed review with no findings. No agy permission settings were changed. A temporary custom agent with `tools: []` still advertised the full tool list in its init event; it is not used by the implementation and is not treated as a capability boundary.

Automated coverage includes megabyte stdin delivery, early stdin closure, malformed/missing/duplicate results, empty success, structured denial despite successful status, and review-specific version gating. Cached packaging tests exercise both review modes through the new transport. Five real-service tests remain opt-in; the new static-review smoke accepts `AGY_LIVE_MODEL`.

The final companion invocation reviewed 14 modified and 10 untracked files with Gemini 3.8 Flash (High), exited zero, and returned five findings. Verification:

- **Addressed:** review/adversarial Codex skills still advertised agy 1.0.7+. Both now require 1.1.15+; the shared helper also distinguishes review versus task/setup requirements.
- **Not reproduced:** missing-CLI JSON crash. `runSetup` initializes `auth: { authenticated: false }` before probing; missing-runtime JSON remains valid.
- **Incorrect premise:** `AGY_BINARY` is a local constant equal to `"agy"`, not an environment override. All transports resolve the same binary through PATH.
- **Retained by design:** cancellation waits for the grace period even when direct-child pipes close, because surviving descendants still need termination. Immediately resolving would regress the previously verified process-group cleanup.
- **Retained by design:** malformed stdout fails structured review parsing. Silently skipping corrupt protocol lines could conceal a failure; no real run required this relaxation.

The model's raw NO-SHIP verdict was based on these findings; it is not adopted without verification. The complete response is saved in `docs/gemini-flash-review.md`.

## Reactive diagnostics and explicit sandbox grants (2026-09-12)

The user reported the following results from fresh Codex sessions on macOS 26.6.2 (25G83), Codex CLI 0.154.0, and agy 1.2.2. Both sessions used the checkout's `plugins/ask-antigravity/scripts/antigravity-companion.mjs`, rather than the installed plugin cache.

- **Restricted session:** `setup --live --json` exited 1 with `ready: false` and `live.ok: false`. Original stderr reported denied log and crash-file opens under `~/.gemini/antigravity-cli/` and `listen tcp 127.0.0.1:0: bind: operation not permitted`. The shared hint correctly named both socket binding and access to agy runtime state, preserving the original diagnostics. Review was not run and no fixture was created. No retries or configuration changes occurred.
- **Configured session:** Following the launch instructions below, live setup exited 0 with `ready: true`, `live.ok: true`, and “Live response verified.” Static review also exited 0 and identified `add.js:2` returning `a - b` as an arithmetic regression, recommending `a + b`. Neither successful call emitted a reactive hint. The disposable repository was removed and its absence verified; the test left the source checkout unchanged.

The supplied launch instructions were:

```bash
codex -s workspace-write \
  --add-dir "$HOME/.gemini/antigravity-cli" \
  -c 'sandbox_workspace_write.network_access=true'
```

The separate `codex --version` command warned `could not create PATH aliases: Operation not permitted (os error 1)`. This warning did not prevent the reported setup and review successes; its cause was not investigated in these tests.

These are user-reported live results for the source companion on the versions above. They do not establish installed-cache readiness, rescue tool permissions, behavior under other host policies, or the coverage of `--log-file` and alternate authentication modes. The failed invocation demonstrates actual log/crash write attempts and a local bind attempt; it does not prove every invocation performs those operations.
