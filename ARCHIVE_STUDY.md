# Findings from the supplied release

## Archive and program

The fourteen supplied volumes (`vanguard-princess.z01` through `.z13`, plus `.zip`) form one split ZIP archive. They were joined with Info-ZIP's `zip -s 0` and extracted successfully. The archive contains 69 entries totaling 760,477,027 uncompressed bytes. The originals remain outside this development checkout.

Key contents:

| Files | Role |
| --- | --- |
| `vanpri.exe` | Compiled Windows 2D Fighter Maker 2002 runtime |
| `VanguardOnline.exe`, `SDL2.dll` | Windows launcher / input and presentation wrapper |
| `vanpri.KGT` | Shared scripts, UI images and sound effects |
| `c1.player`–`c14.player`, `mode.player` | Character, shared support and mode data |
| Eleven `.stage` files | Background layers, stage scripts and embedded music |
| Twenty-two `.demo` files | Original presentation / sequence data |
| `Game_Manual.pdf` | Story, game modes, controls, gauges, fighter and partner descriptions |
| `game.ini` | 640 × 480 presentation and input configuration |

No editable source project, C/C++ source, JavaScript source or browser build was present. The executable headers identify Windows PE binaries. The data signatures are `2DKGT2K` for character/stage data and `2DKGT2G` for shared game data.

The manual describes story and local versus/practice play, a life bar, round timer, match count, assist gauge, Calcium guard gauge, stun gauge and a Liberty Art super meter. Partners include Eko, Kanae, Sierra, Juliet and Hilda. The adaptation selects the first four partners and the ten main fighters; it does not claim to reproduce the original story or all move logic.

## Data format decoded

`tools/game_data.py` reads the relevant parts of these files:

1. The script table count is a little-endian 32-bit value at offset `0x110`.
2. Each script table entry is 39 bytes: a 32-byte Shift-JIS name, a three-byte command index, and four flag bytes.
3. The following command table contains 16-byte records. Opcode `0x0c` supplies a visual frame duration, image identifier and signed position offsets. Image identifiers use the low 13 bits.
4. The image table contains 8,192 slots. Each nonempty slot stores a pointer placeholder, width, height, flags, compressed length and pixel payload. A palette flag adds 1,024 bytes of palette data.
5. Image compression uses two opcode bits and a six-bit count. The packet types are zero fill, literal bytes, repeated-byte fill and an overlapping backwards copy. Extended counts and copy distances are supported. Decoded payload length is checked against the declared dimensions.
6. Palettes store B, G, R and a flag byte. Palette index zero is transparent. Character frames can refer to a shared palette rather than embedding one.
7. Embedded audio is standard `RIFF` / `WAVE`, identified by a valid header and bounded length. ffmpeg converts the chosen clips to browser-compatible Ogg Vorbis.

These findings were checked against the supplied binary layout and the decompression routine in the supplied runtime. The browser never executes the original binary. Asset conversion uses parsed frame records and a selected set of scripts for idle, movement, attacks, hit, guard, knockout and victory animation. Trimmed frames are anchored at their visible feet because the new engine owns character positioning.

## Browser implementation

| Original element | Browser implementation |
| --- | --- |
| Ten main fighters | Extracted sprite atlases, palettes and visual sequences; distinct movement/reach/special profiles |
| Life and match counters | 1,000 life, first to two rounds, 90-second rounds |
| Calcium guard | Guard drain, recovery, low/standing guard distinction and guard breaks |
| Liberty Art gauge | Builds on combat, one full stock activates a character attack |
| Assist gauge and partners | Regeneration, one-button summons, four different support attacks |
| Practice | Unlimited time and Liberty, healing dummy, three dummy behaviors and reset |
| Local versus | Two keyboards bindings or two gamepads on one device |
| Story mode | A new five-rival arcade ladder; original story is not reproduced |
| Windows renderer | Browser Canvas 2D at a 960 × 540 logical resolution |
| Original simulation | A new deterministic 60 Hz JavaScript simulation, with supplied randomness for CPU decisions |

The runtime has no service, account, credential, remote API, analytics, dependency CDN or online matchmaking requirement. The source development server uses only Node's standard library. A self-contained distribution embeds every runtime asset in one HTML file.

## Limits and verification

The original script interpreter, exact frame data and hitboxes, original stun/grab/ammo rules, every motion-input move, bosses and variants, scripted stage spectators, story sequences and rollback networking are outside this adaptation. The game UI states these limits in “About this edition.”

Validation includes 16 Node tests for combat behavior and asset completeness, plus Chromium smoke tests exercising actual keyboard and touch events, all main fighters and included stages, pause/help/resume, training, player two, match/rematch, arcade progression and the offline standalone edition. Round-end browser checks use controlled one-hit-away state setup to exercise real transitions; they are not represented as full human-played matches. Physical gamepad hardware and browsers other than Chromium were not tested.
