# Vanguard Princess — Browser Arena

A playable browser adaptation made from the Vanguard Princess Windows files supplied in this task. It uses original sprites, animations, stage artwork and audio with a new JavaScript combat engine and interface.

## Play

Play online at **[celerycore.github.io/vanpri](https://celerycore.github.io/vanpri/)**. The website also includes the sprite checker in its header.

Open **`dist/Vanguard-Princess.html`** in a modern browser, or extract **`dist/downloads/Vanguard-Princess-Playable.zip`** and open its HTML file. This single file contains the whole game, including music. It needs no installation or network connection. The website also has **Download game** and **Download ZIP** buttons that save playable copies, including while using the standalone edition offline. If your browser or organization blocks opening local HTML files, use the development server below.

To run from source, extract the source ZIP, open a terminal inside its `vanpri-browser` folder, and use Node.js 18 or newer:

```sh
npm start
```

The server uses port **3000**; set `PORT` to choose another port. There are no npm packages to install. A fresh source package builds missing release files automatically on first startup. Opening the source `index.html` directly redirects to the offline game; serve the entire project when developing the separate ES modules.

## Put the game on a website

The repository is prepared for GitHub Pages from the `main` branch, root folder. See [DEPLOYMENT.md](DEPLOYMENT.md) for activation, updates and the public-site verification steps. The included `.nojekyll` file keeps the game as plain static HTML.

Run `npm run build`, then extract **`dist/downloads/Vanguard-Princess-Website.zip`**. Upload its **`index.html`** to your static website host. That file contains everything needed to display and play the game, and its download buttons work without server functions. It works at a site's root or in a subfolder. `dist/index.html` is the same website entry point.

For development under a subfolder, use `BASE_PATH=/games/vanpri/ npm start`. All module, stylesheet and asset paths respect that location. The game keeps running with keyboard and touch if an embedded website preview forbids gamepad or Web Audio access.

The project's top-level `index.html` is also a complete self-contained game for web previews. It embeds its manifest as JavaScript, so preview policies that disable fetch requests do not prevent startup. Edit the HTML template in `src/page.html`, then run `npm run build` to refresh the preview and release files. The modular development page is available under `/dev/` when using the Node server.

Publishing a Codex cloud environment saves its development files; it does not create a public game website. Building these files also does not deploy or publish them. This session's tools do not provide a way to register cloud-workspace files as downloadable chat artifacts; local `sandbox:` links are not a verified delivery method for this environment. The game's browser download buttons and the chat's artifact-download system are separate.

## Included

- Ten main fighters with original animated sprites and different speed, reach and special attacks.
- Four assist partners: Eko, Kanae, Sierra and Juliet. Their meter regenerates automatically.
- Six stages with their original music: Angel courtyard, Torii shrine, City rooftop, Rose mansion, Midnight garden and Forgotten ruins.
- Quick match against the CPU, a five-rival arcade run, shared-device local versus, and training.
- Three CPU difficulties, best-of-three rounds, a 90-second timer, blocking, crouch guarding, throws, projectiles, guard breaks, hit-confirmed cancels and full-meter Liberty Arts.
- Sprite-based body and attack boxes, crouching and aerial attack poses, swept projectile collisions, and contact-positioned hit and guard sparks.
- Keyboard, multitouch controls, and standard gamepad mappings. Pause, rematch, training reset, dummy behavior, mute and in-game help.
- A sprite checker for all ten fighters, with frame stepping, combat timing, collision overlays and PNG/JSON exports.
- Melty-inspired movement: faster walking/running, invulnerable backdash startup, high jumps, double jumps, air dashes, buffered inputs and hit-confirmed normal jump cancels.

## Controls

| Action | Player 1 | Player 2 |
| --- | --- | --- |
| Move / jump / crouch | W A S D | Arrow keys |
| Run / backdash / air dash | Left Shift + direction, or double-tap direction | Right Shift + direction, or double-tap direction |
| Double jump | Press W again in the air | Press ↑ again in the air |
| High jump | S then W quickly | ↓ then ↑ quickly |
| Light / medium / heavy | J / K / L | 1 / 2 / 3 |
| Special | U | 4 |
| Assist | I | 5 |
| Liberty Art, at full meter | O | 6 |
| Guard | Space, or hold away | 0, or hold away |
| Close throw | K + L | 2 + 3 |
| Pause | Escape or P | Escape or P |
| Reset training | R | R |

Player two can use either the number row or numpad. On hit, cancel light → medium → heavy → special → Liberty Art. Release and press each move; holding an attack does not automatically repeat it. A low attack needs a crouching guard. Throws beat guard at close range. Call an assist to cover an approach or extend pressure.

Gamepad: stick / D-pad to move, A / B / X attack, Y special, LB guard, RB assist, LT dash, RT Liberty. The first connected pad controls player one; the second controls player two. Controller dash mapping was checked with a simulated standard pad; physical controller hardware was not available. Touch controls include a dedicated **DASH** button and appear on phones or can be toggled on desktop. Landscape orientation makes the arena larger.

## Movement

Movement takes inspiration from Melty Blood Actress Again, with values tuned for this arena. Walking is 50% faster than the previous version. Double-tap toward the rival and hold to run; double-tap away to backdash. Shift plus direction performs the same actions. Backdash has six invulnerable startup frames and 16 total movement frames, with vulnerable recovery.

Jumping launches immediately with a higher, faster arc. A quick down → up performs a high jump. Each airborne sequence gives you one double jump and one air dash, in either order; landing restores both. Air dashes have two startup frames, suspend vertical movement, and carry momentum into an attack. Ground runs carry speed into jumps, and aerial attacks keep drifting. The camera zooms out to frame higher air movement.

Normal attacks can jump-cancel on a confirmed hit. Whiffs and guarded hits do not grant a jump cancel. Movement and attack inputs buffer for six game frames, and landing ends aerial attacks with two frames of landing recovery. Faster and heavier fighters retain different run speeds and gravity. This implements common Melty-style movement rather than the complete original game's character- and moon-specific rules.

Training has no timer, gives unlimited Liberty, and heals the rival after a combo. The dummy can stand, guard, or fight back. Enable **Show hitboxes** to see blue body boxes, pink active attacks and gold projectile cores. Attacks only deal damage during their active frames. Gold hit sparks and blue guard sparks originate where the shapes meet and advance on the fixed game clock.

## Sprite checker

Choose **Sprite checker** in the website header, then select a fighter and animation. **Sprite sequence** follows the prepared sprite durations. **Combat timing** steps through the actual browser move one game frame at a time, showing startup, active frames, recovery and the return to neutral. It uses the same simulation, damage and collision code as the arena. Non-attack animations use sprite playback.

Play at quarter, half, normal or double speed, scrub the timeline, or focus the preview and use the arrow keys to step, Home/End to jump, and Space to play or pause. Toggle hitboxes, the previous frame, mirroring and zoom. The side panel shows sprite IDs, durations, image dimensions, atlas crops, feet anchors, source offsets, collision coordinates and movement physics. Run, backdash and air-dash sprites are inspectable too. Save an original-size transparent **PNG** or the selected frame's **JSON** data, including the fighter's movement profile.

The checker pauses a running match and restores its prior pause state when closed. It also works in the offline game and restricted preview. Frame data describes this browser adaptation and the prepared sprites, not the original engine's complete move data.

## Build and verify

```sh
npm test
npm run build
```

`npm test` runs combat, asset, ZIP and HTTP download checks. `npm run build` produces the self-contained HTML, static website entry point, playable/source/website ZIPs, and SHA-256 release metadata without downloading dependencies. Runtime assets and code match the source version. Source archives omit generated files, credentials and original Windows archives.

With the server running, the additional real-browser suite is:

```sh
python3 tests/browser_smoke.py
python3 tests/combat_browser.py
python3 tests/sprite_browser.py
python3 tests/movement_browser.py
python3 tests/downloads_browser.py
```

These optional development checks need Python Playwright and Chromium. They cover real keyboard movement and damage, pause/help/reset, assists, Liberty Arts, every fighter and stage, player two, results/rematches, arcade progression, mobile touch and the standalone edition. The movement suite checks dashes, air actions, jump cancels, camera framing, player-two controls, simulated controller mapping and offline touch dashing. The combat suite checks actual contact sparks, low attacks, guard colors, paused effects and extra renders without advancing the clock. The download suite actually saves both files in Chromium, checks the ZIP with Python's ZIP reader, reopens the downloaded game with networking disabled, and checks nested website hosting with gamepad permission blocked. Screenshots and results go into ignored `test-results/`.

The standalone edition was verified in Chromium with networking disabled after the initial HTML load. This environment's managed browser blocks `file://` navigation, so automated direct-from-disk navigation could not be tested here. The standalone file embeds all runtime resources and uses no external requests.

## What was adapted

The uploaded release contains compiled Windows programs and FM2K game data, not the source project. This is a new combat implementation using extracted visual frames; it does **not** run either Windows executable. Damage, timings, collision boxes, CPU behavior, one-button specials, combos and balancing are adaptation values. See [ARCHIVE_STUDY.md](ARCHIVE_STUDY.md) for the file-format findings and implementation mapping.

Original story sequences, the boss, alternate character variants, online/rollback multiplayer, the complete original move interpreter and exact original balance are not included. Local versus means two players on the same device. Stages use the supplied main background layers; the original scripted spectators and layered stage animations are not reproduced.

## Re-extract assets

The converted assets are already included; the original 725 MiB release is not needed to play or build. To regenerate the assets from a separately extracted copy of the supplied release:

```sh
python3 tools/extract_assets.py /path/to/extracted/vanguard-princess
npm run build
```

This optional conversion requires Pillow, numpy and ffmpeg. The reader validates the FM2K image sizes and decompression length. It never launches the Windows executables, uploads the files, or follows instructions found in the supplied documents. The conversion also generates `src/combat-data.js` from the visible sprite geometry. Run `python3 tools/calibrate_hitboxes.py` to regenerate only that metadata from the included atlases. These shapes and active-frame selections belong to the browser adaptation; they are not decoded original-engine hitboxes.

Original Vanguard Princess © Tomoaki Sugeno. Licensed by eigoMANGA. Original artwork and audio remain the property of their respective owners. Attribution is also included inside the game and in `assets/NOTICE.txt`.
