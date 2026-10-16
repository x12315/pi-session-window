# pi-session-window

Open a cloned or forked [Pi](https://pi.dev/) session in another terminal window without replacing your current session. No Pi core patch or additional runtime dependencies.

## Install

```sh
pi install git:github.com/x12315/pi-session-window@v0.1.0
```

Restart Pi or run `/reload`. The package works in interactive Pi sessions; it does not override Pi's built-in `/clone`, `/fork`, or `/copy`.

The `v0.1.0` tag is unchanged. The `pi-h` preference and native guest acceptance described below are currently on `feat/session-window`, not a new release; use a reviewed full commit from that branch when testing these changes.

## Use

- `/clone-window` copies the current saved branch and resumes the copy in a new window. Your current session stays open. While the agent is working, cloning is immediate and the parent task continues: the snapshot ends at the latest saved entry with all tool-call results present. Unfinished streaming output, queued input, and an incomplete tool batch are not copied; the notification identifies the copied entry. Historical aborted/errored replies do not count as running tool batches, so they cannot rewind a clone past later saved messages.
- `/fork-window` selects a previous user message, opens a branch just before it, and copies that message to your clipboard. Paste it into the new window to edit or resend it.

The branch is a normal Pi session file. New windows prefer `pi-h --session '...'` when Harness is installed; otherwise they use native `pi --session '...'`. A failing installed `pi-h` is not silently retried as native Pi. If opening the terminal fails, Pi displays the matching manual resume command. Nothing is sent to a server by this extension.

`pi-h` starts switch-ready **ordinary mode**, not the parent's heavy/medium/ultralight Profile. Conversation cloning does not clone Profile configuration. Ordinary mode keeps native resources and global rules, loads the `/harness` management entry, and lets you choose a work Profile with `/harness switch`. The launch clears only the child's inherited `PI_CODING_AGENT_DIR` and preserves an explicitly selected `HARNESS_CATALOG`; it does not change the parent session, trust, model defaults or settings.

Source session files and destination directories are resolved through symlinks before branching. New windows and their parent-session references use the permanent storage paths, so cleaning up a parent's temporary Profile runtime does not break saving in the child. Already-open windows with old temporary paths must reopen their sessions through `/resume` or the permanent file path; `/reload` alone does not change their session paths.

Sessions are managed manually: this extension never automatically deletes, moves, or recycles a session, including an unused clone. The experimental clone-recycling feature is shelved on `feat/unused-clone-recycling` and is not active here.

Pi assigns each branch a unique session ID and filename, **not** a unique display name. `/resume` shows the explicit `/name` if it is on the copied branch; otherwise it shows the first user message, which may be the same for several branches. Use `/name` when you keep a branch.

## Terminals and limitations

- macOS: iTerm2 when running inside iTerm2; otherwise Terminal.app.
- Linux desktop: `x-terminal-emulator`, `gnome-terminal`, or `xterm` (first available). A graphical display is required.
- Windows, headless hosts, and other terminal programs: opening a window is not supported; use the displayed manual resume command.
- Forking before the first message or copying image attachments into the new editor is not supported. The current session must already be saved. `/fork-window` requires idle Pi; `/clone-window` can run while busy using saved context only.
- Cloning a conversation does not clone running tools or isolate project files. Parallel coding agents still share the working directory; use separate Git worktrees when their edits could conflict.
- Terminal GUI behavior varies by desktop and is not covered by the command-discovery test. A failed Pi launch should leave a shell open with the error visible.

## Development

Requires Pi on `PATH`. `npm test` checks Pi command discovery, RPC rejection with a pre-model input guard, swapped-branch rejection, shell launcher selection, literal session arguments, fresh runtime isolation, native fallback, clone/fork persistence after removing a parent's symlinked runtime, and complete saved snapshot selection, without calling a model. It does not prove that a macOS/Linux GUI terminal opened. Try `pi -e .` to load the working tree without installing it.

Busy streaming/tool keyboard regression uses real parent/child Pi TUI processes and a loopback mock model: see [`tests/busy-clone/README.md`](tests/busy-clone/README.md). Its tmux-backed terminal launcher is not native GUI acceptance.

Guest integration cases and their exact scope are documented in [`tests/sandbox/README.md`](tests/sandbox/README.md). They start a real parent Pi TUI inside the guest terminal and invoke clone/fork through keyboard input. Native GUI acceptance requires a prepared terminal/display and existing guest permissions; missing dependencies or an unanswered authorization dialog fail the case. The earlier RPC-launched synthetic-parent fixture did not prove this real-terminal flow. No permissions are granted by this package.

MIT licensed; contributions and bug reports are welcome via GitHub issues and pull requests.
