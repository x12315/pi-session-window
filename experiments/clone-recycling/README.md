# Shelved clone-recycling experiment

Branch: `feat/unused-clone-recycling`, based on the window-only `feat/session-window` branch. This is an archive for future development, not a release or a daily-use recommendation.

## Preserved behavior

- Observe newly created native `/clone` and `/clone-window` sessions without adding session-tree markers.
- Record a baseline in `.pi-session-window-clones/` and recycle an unchanged clone on exit into `.recycled-session-window/`.
- Keep the source, substantive changes, forks, unknown session roots, and clones with known descendants, including archived descendants.
- Account for Profile launchers that isolate agent settings while retaining Pi's native session root.

The implementation is intentionally retained in `extensions/session-window.ts` on this branch. The active window-only branch has no lifecycle handlers or clone-tracking/recycling code. Do not load this experimental branch inadvertently: its recycling logic is active unless `PI_SESSION_WINDOW_RECYCLE=0` is set.

## Evidence and unresolved work

Previous Linux sandbox and macOS CLI/TUI tests passed, including normal-autoload `/resume` observations. The user nevertheless reported a failure during manual testing, so the feature was withdrawn rather than declared fixed. The exact failing manual scenario has not been established. Real macOS/iTerm GUI window behavior remains unverified.

Known public-API limits also remain: custom session-directory descendants, concurrent child creation, and another process using the same clone cannot be checked atomically. Future work must reproduce the user's case in the real loaded installation and preserve native Pi lineage before reconsidering activation.

## Saved fixture

`smoke.mjs` is the existing Linux sandbox fixture, retained without making it part of the normal package tests. It requires `tmux`, Pi installed at `/usr/lib/node_modules/@earendil-works/pi-coding-agent`, and this branch's extension mounted at `/work/session-window.ts`. Its window commands intentionally exercise branch creation with a manual-resume fallback on a headless host, not a real terminal GUI. Run it only in a disposable sandbox: it creates isolated HOME and session directories and does not clean all fixture directories.

The fixture covers unchanged native/window clones, Profile isolation, renamed clones, cross-directory children, archived children, and preservation of native/window forks. It does not reproduce the unresolved real-user GUI failure. No historical user sessions or credentials are included.
