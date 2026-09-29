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

The branch is a normal Pi session file. If opening the terminal fails, Pi displays the `pi --session '...'` command to resume it manually. Nothing is sent to a server by this extension.

## Terminals and limitations

- macOS: iTerm2 when running inside iTerm2; otherwise Terminal.app.
- Linux desktop: `x-terminal-emulator`, `gnome-terminal`, or `xterm` (first available). A graphical display is required.
- Windows, headless hosts, and other terminal programs: opening a window is not supported; use the displayed manual resume command.
- Forking before the first message or copying image attachments into the new editor is not supported. The current session must already be saved, and Pi must be idle.
- Terminal GUI behavior varies by desktop and is not covered by the command-discovery test. A failed Pi launch should leave a shell open with the error visible.

## Development

Requires Pi on `PATH`. `npm test` checks that Pi can load the package and discover both commands without calling a model. Try `pi -e .` to load the working tree without installing it.

MIT licensed; contributions and bug reports are welcome via GitHub issues and pull requests.
