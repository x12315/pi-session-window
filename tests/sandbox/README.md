# Window guest integration tests

Consumer-owned cases for `agent-harness-sandbox` commit
`3bde2b75f20c7a033f71dd4cb31ee03e51c8026f` (unreleased interface).
The previous `afd0c8a` image recipe did not include the native xterm requirement.
All commands/apps run inside fresh disposable guests. No downloads, model prompts,
permission grants, native preference edits, host GUI or base image changes.

```sh
# Linux host: select a prepared Xvfb/xterm/xwininfo/tmux image and matching checkout.
OUT=/absolute/prepared-image EXECUTION=local \
  /path/to/agent-harness-sandbox/bin/test.sh --project /path/to/window-snapshot window-linux

# macOS: privately source mode-600 macos-ready.env; never print it.
EXECUTION=local CASE_TIMEOUT=180 \
  /path/to/agent-harness-sandbox/bin/test.sh --project "$PWD" window-macos
```

Run under a detached 600-second lifecycle supervisor. At 90 seconds inspect
startup/SSH/guest logs instead of blindly waiting; only clean up invocation-owned
VMs. Tart connection reuse belongs to Sandbox's runner, not a project-owned SSH wrapper;
use its native SSH/SCP transport with pinned host checks.

Both cases declare every injected input through `push`, run nine Node tests
(including metadata-confirmed RPC command/guard discovery, rejection of both window
commands and blocking an intentionally unregistered command before a model turn),
and create a synthetic persisted conversation without requesting a model.
RPC is used only to seed that conversation. The parent then starts as **actual
Pi TUI inside a guest terminal**, with the production extension and an observational
probe. No `ctx.mode` substitution, fake selector or direct handler call is used.

macOS uses the seed's supported SSH → System Events keyboard path to open an iTerm
window and type the parent shell command. It then returns to that parent's iTerm
numbered-window keyboard shortcut, pastes literal `/clone-window` and `/fork-window`
through the guest's ordinary clipboard/UI path, and presses Enter in
the real selection overlay (the latest user message is selected). Linux starts the
parent in a private tmux session attached to a visible guest xterm on Xvfb, and sends
literal command/Enter input through that real terminal PTY. It waits for the real
fork overlay before confirming; it does not need xdotool or a window manager.

Two native child Pi processes report actual `hasUI`, stdin/stdout TTY, mode (null
if the older public API has no mode field), terminal identity and resumed branch.
The clone-stage child is recorded before issuing fork, so swapping the two command
results fails. Every ordinary input reaching the parent probe is blocked: registered
extension commands execute before that input event. Strict assertions check distinct
PIDs/files, named clone/fork contents (four/two messages),
parent linkage, unchanged parent file and leaf after real TUI startup, literal launch
arguments and runtime isolation. The baseline is captured from the running parent,
not the seed: Pi may append its own initialization entries when opening a session. macOS additionally requires exactly two new visible CoreGraphics iTerm
window IDs while retaining all baseline windows; Linux requires at least three
XTerm windows in the private display. Read the actual guest screenshot as well.

The `pi-h` **marker shim is not Harness**: it proves launcher preference and clearing
`PI_CODING_AGENT_DIR`, then executes installed native Pi offline. This does not test
Harness ordinary/profile switching, clipboard paste, trust approval or models.
`handler-fixture.ts` remains a legacy synthetic-parent fixture and is **not used by
these GUI acceptance cases**; its results must not be called keyboard acceptance.

The competing macOS hypotheses are that Pi launched inside iTerm can control that
same app without additional approval, or that additional Automation permission is
still needed. Only a fresh-clone result decides this for the tested seed/version.
An unanswered authorization dialog, TCC denial, missing dependency or missing child
is failure, not a skip. Never approve a dialog or modify TCC/SIP during the test.

Read `guest/tmp/ah.{out,err,rc}`, `project-source.sha256`, `assert.txt` and `gui.png`.
Linux also collects `/tmp/ah-artifacts/window/`; macOS prints JSON evidence to guest
stdout because Tart has no generic attachment-download contract. Earlier Node
passes alone are **not** a GUI integration pass. Test outcomes and remaining platform
scope must be reported from the actual run artifacts, not inferred from the fixture.

## Verified scope (2026-10-10)

Both guest platforms passed all nine tests and the real-parent/real-child TUI
assertions: three distinct Pi processes, named clone (four messages) and fork (two),
two new native windows, unchanged live parent, literal session resume and child
runtime isolation. macOS used Pi 0.87.1 / Node 24.21.0 in guest iTerm with Sandbox's
native SSH/SCP transport; Linux used Pi 0.87.1 / Node 26.11.1 with the independently
rebuilt xterm 411-1 image (not the old default OUT). No new TCC authorization.
The swapped-branch negative fails and an unknown RPC command is blocked without a
model turn. During an earlier macOS rerun the guard caught a mistyped slash command;
ordinary guest clipboard paste now supplies literal command text instead of a burst
of simulated character keystrokes. This is test input delivery, not product clipboard
acceptance: iTerm's OSC52 copy policy remains unchanged and clipboard paste of the
selected user message is unverified. `pi-h` is a marker shim here, not real Harness.

Evidence: macOS `run-native-transport`, Linux `20261010T063148Z-Dio8q1`;
local archive `.window-sandbox-alignment-rywTGR/` (not distributed with the package).
Earlier failed runs are retained.
