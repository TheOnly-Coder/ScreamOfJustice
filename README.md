# Scream Of Justice

A fast, tactical 3D FPS built with React + Three.js — play it on this repo's
GitHub Pages (see Deployments), or clone `/main` and run it locally.

## What's inside

- **Real 3D character models** — every soldier in classic, team matches and the
  campaign (including teammates and mission NPCs) uses a proper animated GLTF
  character with skeletal idle/walk/run animations plus procedural
  weapon-holding and jump layers. No more T-posing box people.
- **Real 3D weapon models** — first-person and third-person weapons are GLB
  models, not primitive boxes. 40+ weapons mapped across 14 model kinds
  (rifles, SMGs, snipers, shotguns, LMGs, pistols, revolvers, launchers,
  katanas, knives, swords, axes).
- **Team colors, not unique characters** — in team modes every character wears
  its team's color, so you can read the battlefield at a glance.
- Classic FFA deathmatch vs bots, 2v2 / 4v4 / 2v2v2 team modes, local or
  online multiplayer, and a 3-chapter campaign with dialogue and cutscenes.
- Aim assist, shaders, procedural textures, killfeed, medals, scoreboard, the
  works.

## Controls (default)

| Input | Action |
|---|---|
| W A S D | Move |
| Mouse | Look & aim |
| Left click | Shoot |
| Right click | Scope (ADS) |
| Space | Jump |
| Shift | Sprint |
| R | Reload |
| 1 / 2 | Switch weapons |
| Q | Class ability |

## Run it yourself

```bash
npm install
npm run dev        # dev server
npm run build      # production build to dist/
```

Deploys are automatic: pushes to `main` build the site with Vite and publish
it via the GitHub Pages workflow (`.github/workflows/deploy-pages.yml`).

## Model credits (all CC0)

- Character + weapons (rifle, shotgun, sniper, pistol, revolver, P90, melee):
  [Quaternius](https://quaternius.com) — Animated FPS Guns, Knight Character &
  Medieval Weapons packs
- Character animations: Mixamo rig ("Vanguard" soldier, via three.js examples)
- Blaster kit props (launcher tube, grenade): [Kenney](https://kenney.nl)

yeah, just enjoy the game...
-TheOnly-Coder (Developer)
