# METRO RUSH 3D

Neon-soaked endless runner. Three.js, no build step, no dependencies to install.

```
index.html          entry point — all screens + HUD markup
css/style.css       UI, menus, HUD, animations
js/utils.js         math helpers, RNG, object pooling, storage
js/audio.js         procedural WebAudio SFX + music (no audio files)
js/particles.js     pooled sprite particles (dust, sparks, coin bursts)
js/player.js        player rig, run/jump/slide animation, input
js/chasers.js       Unit 12 officer + K9 Rex pursuit system
js/world.js         track, tunnels, scenery, trains, obstacles, coins
js/game.js          loop, state machine, scoring, power-ups, collisions
vendor/three.min.js Three.js r150 (vendored, no CDN)
```

## Run it locally

**Simplest — no server at all.** Double-click `index.html`. Everything loads from
`file://`; the only thing that needs a network is the Google Fonts stylesheet,
and the game falls back to system fonts without it.

**With a local server** (closer to production, enables clean URLs):

```bash
cd metro-rush-vercel
python3 -m http.server 5173      # then open http://localhost:5173
# or
npm run dev                       # uses npx serve
```

## Deploy to Vercel

**Option A — drag and drop.** Go to <https://vercel.com/new>, drag the whole
`metro-rush-vercel` folder onto the page, hit Deploy. No framework preset, no
build command, no environment variables.

**Option B — CLI.**

```bash
npm i -g vercel
cd metro-rush-vercel
vercel          # preview deploy
vercel --prod   # production
```

**Option C — Git.** Push the folder to GitHub, import the repo in Vercel.
If it asks for a framework preset choose **Other**; leave Build Command and
Output Directory empty. Vercel serves the repo root as static files.

`vercel.json` only sets cache headers (long cache for the vendored Three.js,
revalidate for your own JS/CSS so deploys show up immediately) plus a few
security headers. It contains no routing rules, so nothing can shadow the files.

## Controls

| Input | Action |
|---|---|
| `A` / `D` or `←` / `→` | Switch lane |
| `Space` / `↑` | Jump |
| `S` / `↓` | Slide |
| `P` | Pause |
| `M` | Mute |
| Swipe / tap | Mobile equivalents |

## URL switches

Append to the URL to force a quality tier:

- `?hq` — full quality: shadows, high pixel ratio, all effects
- `?lite` — drops shadows and halves the pixel ratio for weak GPUs

## How the chase works

Unit 12 and K9 Rex run *behind* the player, flanking left and right so the
runner is never visually blocked. Heat rises on mistakes and falls on clean
running:

| Event | Heat |
|---|---|
| Clean running | −0.014 / s |
| Raw speed above 24 u/s | +0.0016 / u/s |
| Turbo | −0.34 |
| Magnet | −0.14 |
| Close call (hazard cleared by < 0.5 u) | **+0.13** + stumble |

At maximum heat a crash is a capture: the officer closes to arm's length and
tags you, the dog bounds in, `CAUGHT!` stamps in, and the results card follows.
No gore — it's a tag, and the run restarts clean.

## Notes

- Rendering budget: ~315 draw calls / ~40k triangles with the chase active.
- Everything is procedural — no image, model or audio assets to host.
- High score and coin bank persist in `localStorage` under the `metrorush3d.` prefix.
