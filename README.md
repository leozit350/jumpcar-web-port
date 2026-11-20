# Jump Car web port

A web port of the popular Android game Jump Car. It was written from the decompiled game code and runs in the browser as a static page with no build step and no server-side code.

In Jump Car you control a car that climbs a stack of layers, jumping and reversing direction to keep going. Your score is the number of layers you reach.

Play it in the browser at https://leozit350.github.io/jumpcar-web-port/

The art and sounds in `assets/` were extracted from the original Android game.

## Run locally

From the repository folder:

```sh
python3 -m http.server 8002 --bind 127.0.0.1
```

Open `http://127.0.0.1:8002/`. Do not expose this server publicly.

## Controls

The title screen shows a short controls reference above the sound toggle.

| Input | Action |
| --- | --- |
| Tap or hold the screen | Jump (hold to climb) |
| On-screen `X` button, bottom-left (during play) | Reverse the car's direction |
| Space, Z, or ArrowUp | Jump (desktop) |
| `X` key | Reverse the car's direction (desktop) |
| `M` key, or the `SOUND ON`/`SOUND OFF` label in the bottom-right | Toggle sound effects |

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
