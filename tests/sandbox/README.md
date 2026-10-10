# Window guest integration tests

Consumer-owned cases for `agent-harness-sandbox` commit
`afd0c8a045e0b109c781bd3031dfc782c90f601c` (unreleased interface).
All tested commands/apps run inside disposable guests. No package downloads,
model prompts, native preference changes, or base image changes.

```sh
# Linux: select a unique matching Sandbox checkout, never replace a shared tree.
REMOTE=montana@100.115.123.9 DEST=<unique-matching-checkout> \
  /path/to/agent-harness-sandbox/bin/test.sh --project "$PWD" window-linux

# macOS: privately load the ready-base SSH configuration first; do not print it.
EXECUTION=local TART_BASE_VM=<stopped-ready-base> CASE_TIMEOUT=120 \
  /path/to/agent-harness-sandbox/bin/test.sh --project "$PWD" window-macos
```

Use a detached supervisor with a 600-second outer deadline and a 90-second
checkpoint for startup/SSH/collection; preserve logs on failure and only clean
up VMs owned by that invocation. `CASE_TIMEOUT` only bounds the Tart guest command.

Both cases inject the package, launcher helper, seven Node tests (including
bundle-ID/Terminal selection regression) and small shared guest fixtures through `push`. They first run the existing tests,
including real Pi RPC command discovery. Next, real extension handlers operate
on a synthetic persisted `SessionManager` conversation. The parent selector UI
is a **handler fixture**, not keyboard-driven Pi TUI: it renders the component
and supplies its confirm action. Native guest terminal launch is not mocked.
Two child **real Pi TUI** processes report resumed session state through a probe
extension; assertions check clone/fork content, distinct files, parent linkage,
unchanged parent file/leaf, literal launch arguments and environment isolation.

The injected **pi-h marker shim is not Harness**. It proves pi-h preference and
removal of `PI_CODING_AGENT_DIR`, then executes installed native Pi offline.
This does not validate ordinary Harness/profile switching, keyboard interaction,
clipboard paste, trust approval or model behavior. Clipboard warnings do not
invalidate the independently checked fork resume.

Linux requires preinstalled Xvfb, xterm and xwininfo and uses a guest-private X11
display. Missing tools return guest rc 42 without installing anything. macOS
requires a ready Aqua desktop, iTerm, permitted guest Apple Events and screen
capture. TCC denial or an unanswered Automation prompt is a failure, not a skip or
permission workaround. The handler fixture has a 60-second deadline so a blocked
Apple Event records the pending stage and fails before the guest-command timeout.

Read `guest/tmp/ah.{out,err,rc}`, `project-source.sha256`, and `assert.txt`.
Linux additionally collects `/tmp/ah-artifacts/window/` (fixture sessions, JSON
records, terminal tree and optional screenshot); macOS stores `gui.png` and
prints fixture JSON/error evidence into guest stdout/stderr because Tart has no
generic attachment download contract. A failing GUI phase leaves earlier Node
results intact; passing Node tests alone are **not** an integration pass.
