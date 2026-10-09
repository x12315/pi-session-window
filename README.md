# pi-session-window

Open a cloned or forked [Pi](https://pi.dev/) session in another terminal window without replacing your current session. No Pi core patch or additional runtime dependencies.

> **Shelved experiment:** `feat/unused-clone-recycling` preserves the unfinished automatic clone-recycling feature for future work. It is not the active daily-use version. Manual testing still reported a bug; automated checks do not establish real iTerm GUI correctness. Use `feat/session-window` for window commands without automatic cleanup. See [experiment notes](experiments/clone-recycling/README.md).

## Install

```sh
pi install git:github.com/x12315/pi-session-window@v0.1.0
```

Restart Pi or run `/reload`. The package works in interactive Pi sessions; it does not override Pi's built-in `/clone`, `/fork`, or `/copy`.

## Use

- `/clone-window` copies the current saved branch and resumes the copy in a new window. Your current session stays open.
- `/fork-window` selects a previous user message, opens a branch just before it, and copies that message to your clipboard. Paste it into the new window to edit or resend it.

The branch is a normal Pi session file. If opening the terminal fails, Pi displays the `pi --session '...'` command to resume it manually. Nothing is sent to a server by this extension.

When leaving a newly created `/clone` or `/clone-window` session, the extension moves it to `<session-dir>/.recycled-session-window/` **only if** it has no new conversation or other substantive entries and no known child sessions. The original session stays in place; `/fork` and `/fork-window` are never automatically recycled. To restore a clone, move its JSONL file back into the session directory. Tracking uses a separate hidden record, not an entry in Pi's session tree. Automatic cleanup covers Pi's native default session root and the current agent directory's session root, including Profile launchers that isolate settings while retaining native sessions; custom session directories and uncertain cases are left untouched. A crash can also leave an unused clone in place.

Pi assigns each branch a unique session ID and filename, **not** a unique display name. `/resume` shows the explicit `/name` if it is on the copied branch; otherwise it shows the first user message, which may be the same for several branches. Use `/name` when you keep a branch.

## Terminals and limitations

- macOS: iTerm2 when running inside iTerm2; otherwise Terminal.app.
- Linux desktop: `x-terminal-emulator`, `gnome-terminal`, or `xterm` (first available). A graphical display is required.
- Windows, headless hosts, and other terminal programs: opening a window is not supported; use the displayed manual resume command.
- Forking before the first message or copying image attachments into the new editor is not supported. The current session must already be saved, and Pi must be idle.
- The extension scans Pi's default session directories for children before recycling. A child created in a custom session directory or concurrently during that scan, and another process using the same clone, cannot be checked atomically through Pi's public APIs. Set `PI_SESSION_WINDOW_RECYCLE=0` before launching Pi in those workflows. Restore the parent from `.recycled-session-window/` if needed.
- Terminal GUI behavior varies by desktop and is not covered by the command-discovery test. A failed Pi launch should leave a shell open with the error visible.

## Development

Requires Pi on `PATH`. `npm test` checks that Pi can load the package and discover both commands without calling a model. Try `pi -e .` to load the working tree without installing it.

MIT licensed; contributions and bug reports are welcome via GitHub issues and pull requests.
