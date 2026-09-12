---
description: Check whether the local Antigravity CLI is installed and authenticated
argument-hint: ''
allowed-tools: Bash(node:*), AskUserQuestion
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/antigravity-companion.mjs" setup --json
```

If the JSON result has `installed: false`:
- Do NOT auto-run any installer. Tell the user the Antigravity CLI (`agy`) is not installed and print one of these commands for them to run themselves:

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

or

```bash
brew install --cask antigravity-cli
```

- After they confirm they have installed it, rerun:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/antigravity-companion.mjs" setup
```

If the JSON result has `installed: true` and `authenticated: false`:
- Tell the user to run `!agy` and complete sign-in (Google account).

If the JSON result has `ready: true`:
- Show a brief confirmation and mention `/ask-antigravity:review` and `/ask-antigravity:rescue` as the next things to try.

Output rules:
- Present the final setup output to the user (the human-readable rerun, not the JSON).
- Do not paraphrase the install/auth instructions; surface them verbatim.
- Never run a remote installer on the user's behalf. Only print the install command.
