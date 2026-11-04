# Frond

A calm, botanical word search. There's a new 8×8 puzzle every day, plus 13 themed packs (plants, animals, food and places) at three sizes: Easy 8×8, Medium 10×10 and Hard 12×12. It keeps streaks and stats, has light and dark themes, and includes accessibility settings.

**Play:** https://robertrese.github.io/frond/

It works offline after your first visit, and you can install it as an app:

- **Android (Chrome):** open the link, then tap **Install app** (or ⋮ → **Add to Home screen**).
- **iPhone (Safari):** open the link, tap **Share**, then **Add to Home Screen**.

Progress is saved on your device only.

## How it's built

There's no framework and no npm install. The game is plain HTML, CSS and JavaScript, and every puzzle grid is generated in the browser from a fixed seed, so everyone gets the same daily puzzle.

| Path | What it is |
|---|---|
| `src/` | The page, styles, game code, word packs and service worker template |
| `assets/` | Self-hosted fonts (with their licences) and app icons |
| `tools/build.py` | Builds `site/` (the installable web app) and `dist/` (a single-file copy) |
| `tools/icons.py` | Redraws the app icons (needs Pillow) |
| `tests/run.js` | Puzzle, site, contrast and privacy checks |

## Develop

You need Python 3 and Node 18 or later.

```bash
python tools/build.py .
node tests/run.js
python -m http.server 8000
```

Then open http://localhost:8000/site/. It's served from a subfolder, just like GitHub Pages.

## Publish an update

Push to `main`. The **Deploy to GitHub Pages** workflow builds the site, runs the tests and publishes it only if they pass. Installed copies pick up the new version the next time they're opened online.

## Credits

The fonts are [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) and [DM Mono](https://github.com/googlefonts/dm-mono), both under the SIL Open Font License 1.1. The licence texts are in `assets/fonts/`.
