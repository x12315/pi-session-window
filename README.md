# pi-session-window

Open a cloned or forked [Pi](https://pi.dev/) session in another terminal window without replacing your current session. No Pi core patch or additional runtime dependencies.

## Install

```sh
pi install git:github.com/x12315/pi-session-window@v0.1.0
```

Restart Pi or run `/reload`. The package works in interactive Pi sessions; it does not override Pi's built-in `/clone`, `/fork`, or `/copy`.

## Use

- `/clone-window` copies the current saved branch and resumes the copy in a new window. Your current session stays open.
- `/fork-window` selects a previous user message, opens a branch just before it, and copies that message to your clipboard. Paste it into the new window to edit or resend it.

The branch is a normal Pi session file. New windows prefer `pi-h --session '...'` when Harness is installed; otherwise they use native `pi --session '...'`. A failing installed `pi-h` is not silently retried as native Pi. If opening the terminal fails, Pi displays the matching manual resume command. Nothing is sent to a server by this extension.

`pi-h` starts switch-ready **ordinary mode**, not the parent's heavy/medium/ultralight Profile. Conversation cloning does not clone Profile configuration. Ordinary mode keeps native resources and global rules, loads the `/harness` management entry, and lets you choose a work Profile with `/harness switch`. The launch clears only the child's inherited `PI_CODING_AGENT_DIR` and preserves an explicitly selected `HARNESS_CATALOG`; it does not change the parent session, trust, model defaults or settings.

Sessions are managed manually: this extension never automatically deletes, moves, or recycles a session, including an unused clone. The experimental clone-recycling feature is shelved on `feat/unused-clone-recycling` and is not active here.

Pi assigns each branch a unique session ID and filename, **not** a unique display name. `/resume` shows the explicit `/name` if it is on the copied branch; otherwise it shows the first user message, which may be the same for several branches. Use `/name` when you keep a branch.

## Terminals and limitations

- macOS: iTerm2 when running inside iTerm2; otherwise Terminal.app.
- Linux desktop: `x-terminal-emulator`, `gnome-terminal`, or `xterm` (first available). A graphical display is required.
- Windows, headless hosts, and other terminal programs: opening a window is not supported; use the displayed manual resume command.
- Forking before the first message or copying image attachments into the new editor is not supported. The current session must already be saved, and Pi must be idle.
- Terminal GUI behavior varies by desktop and is not covered by the command-discovery test. A failed Pi launch should leave a shell open with the error visible.

## Development

Requires Pi on `PATH`. `npm test` checks Pi command discovery and shell launcher selection, literal session arguments, fresh runtime isolation and native fallback without calling a model. It does not prove that a macOS/Linux GUI terminal opened. Try `pi -e .` to load the working tree without installing it.

Guest integration cases and their exact scope are documented in [`tests/sandbox/README.md`](tests/sandbox/README.md). Native GUI acceptance requires a prepared Linux terminal/display or macOS Automation permission for the process controlling iTerm. The current Sandbox runs passed package/launcher checks but did not pass GUI clone/fork: Linux lacked terminal dependencies; macOS stopped at an unanswered guest Automation prompt. No permissions are granted by this package.

MIT licensed; contributions and bug reports are welcome via GitHub issues and pull requests.
