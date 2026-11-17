# Solara City

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/moonku-ai/solara-city-v2/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/moonku-ai/solara-city-v2/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game for the [make.fun](https://make.fun) **gta6-01 "Make GTA 6"** bounty — a complete, playable, offline browser game built with three.js. No real city, person or brand: Solara City is fiction.

## Play

Serve the `game/` folder with any static server and open `index.html`, or run the included one:

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no network requests — every file is local under `game/`.

## The game

Raka arrives in **Solara City** with $100 and a phone full of jobs from Mira. Explore five districts (Downtown, Marina, Old Town, Harbor, Hillside) on foot and by car, steal cars, outrun the police, and finish four story missions:

1. **First Wheels** — steal a car and bring it to the Marina garage.
2. **Night Courier** — three parcels, three drops, 150 seconds on the clock.
3. **Heat Rising** — shake a three-star wanted level and reach the Hillside safehouse.
4. **The Big Score** — rob the Solara Bank, take out its guards, and escape.

### Systems

- **Driving** — arcade handling, handbrake, traffic that follows the road grid, parked cars to take, car health and explosions.
- **Wanted level 0–5** — crimes raise the heat; police cars chase and ram, foot officers shoot at high heat; get **BUSTED** if they corner you, **WASTED** if your health runs out.
- **Combat** — a pistol with tracers, muzzle flashes and armed bank guards.
- **Pedestrians** — they stroll the sidewalks and flee from gunshots and speeding cars.
- **HUD + minimap + big map** — cash, health, wanted stars, speed, mission objective with timer and distance, a live minimap and a full-city map (`M`).
- **Day/night cycle** — the sun sets, streetlights come on, the bay glows at dusk.
- **Sound** — original WebAudio: engine hum, two-tone sirens, gunshots, explosions, pickups, a mission jingle and an ambient pad loop. No audio files.
- **Save game** — progress saves to localStorage after every mission; continue from the title screen.

### Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Mouse drag | Orbit camera |
| E | Enter / steal a car (or get out) |
| F / Click | Shoot |
| Space | Jump / handbrake |
| Shift | Run |
| M | Big map |
| P / Esc | Pause |
| U | Mute |
| H | Horn |

## Structure

```
game/
  index.html            page + HUD styles
  vendor/
    three.module.min.js three.js 0.160.0 (vendored, minified)
  src/
    main.js             boot + game loop + camera + screens
    city.js             the city, districts, day/night, collisions
    vehicles.js         cars, traffic AI, driving, stealing
    people.js           pedestrians
    police.js           wanted level, police cars, foot officers
    missions.js         the four story missions
    combat.js           shooting, guards, tracers, damage
    hud.js              HUD, minimap, big map, menus
    save.js             localStorage save game
    audio.js            original WebAudio sound + music
    effects.js          particles, explosions, screen shake
    shots.js            ?shot= screenshot scenes
    input.js            keyboard + mouse
    util.js             seeded RNG + math helpers
    config.js           constants, districts, tuning
```

Screenshots are staged by playing the real game forward (`?shot=start|drive|chase|mission&seed=7`) — see `shots.json`.

## License

MIT — see [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
