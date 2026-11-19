# Jump Car web port (private)

A browser port of the Jump Car mobile game, written from the decompiled game code. It runs as a static page with no build step and no server-side code.

The art and sounds in `assets/` were extracted from the original game. This repository is private and for personal use only. Do not make it public.

## Run locally

From the repository folder:

```sh
python3 -m http.server 8002 --bind 127.0.0.1
```

Open `http://127.0.0.1:8002/`. Do not expose this server publicly.

## Controls

Tap to jump and hold to climb, as in the original. On desktop, Space or ArrowUp acts as a press, and `M` toggles sound. A `SOUND ON`/`SOUND OFF` label in the bottom-right corner does the same on the title screen.

## Files

- `index.html`: the page and script load order
- `js/`: game code (physics, platforms, traffic, UI, rendering, and the app shell)
- `assets/`: sprite atlas and sound effects

## Notes

- Random numbers come from `Math.random`, so runs will differ from the original's sequences even though the distributions match.
- Physics uses the browser's frame time, so results can vary slightly with frame rate.
- Saved records are kept in `localStorage` under `jumpcar-web.*` and don't carry over from the Android app.
- Settings, Stats, Achievements, Leaderboards, Credits, Share, Rate, ads, and Google Play features are not ported.

## AI disclosure

AI coding tools were used extensively in building this project.
