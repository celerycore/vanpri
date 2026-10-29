# Verification — 29 October 2026

- `npm test`: **24 passed**, 0 failed, 0 skipped, including embedded manifest, ZIP and HTTP download tests.
- `npm run build`: self-contained HTML, static website entry point and playable/source/website ZIPs generated successfully. The HTML is approximately 14.9 MiB.
- `python3 tests/browser_smoke.py`: **passed** in installed Chromium, with no page errors or failed HTTP responses.
- `python3 tests/downloads_browser.py`: **passed**, including actual saved browser downloads and gameplay with restricted preview permissions.
- `python3 tests/preview_browser.py`: verifies the project entry and distribution with fetch completely disabled and restrictive preview permissions, including rendered combat, damage and browser file saves.
- Asset validation: **1,051 fighter sprite rectangles and their anchors**, plus all assist atlas rectangles, decoded and checked within image bounds.

Browser checks exercised:

- Safely cancelling a match while its assets load.
- Real keyboard movement and an attack that reduces the rival's health.
- Pause freezing simulation, opening/closing help, resuming, and resetting training.
- Calling an assist and activating a Liberty Art.
- Loading and accepting attacks for every main fighter and all six included stages.
- Player-two movement and attacks, match results, and rematch reset.
- Advancing an arcade run to a different rival.
- Mobile layout without horizontal overflow and a real touch attack.
- Playing the standalone HTML with the browser network disabled after its initial load, with zero subsequent network requests.
- Saving HTML and ZIP files through the website's real download buttons; validating the downloaded ZIP with Python's independent ZIP reader.
- Reopening the saved HTML and fighting with networking disabled, then downloading another playable copy while offline.
- Hosting the source under a subfolder with gamepad permission disabled and Web Audio construction denied. Keyboard attacks still damage the rival.
- Serving only the website ZIP's index.html under a nested address, including mobile download and touch gameplay.

The prior blank arena was reproduced: denying the Gamepad API caused an uncaught SecurityError and left the simulation at frame zero. Controller discovery now degrades gracefully, preserving keyboard and touch play. Website paths are relative, downloads use real browser file saves, and HTTP release endpoints provide attachment headers and complete verified bytes.

The exact reported asset-loading message was also reproduced by applying `connect-src 'none'` to the old standalone game. Its call to `fetch(data:manifest...)` failed even though the manifest was embedded. Metadata is now compiled directly into JavaScript, with no manifest fetch. The top-level `index.html` contains the complete bundle, and the Node server uses that complete game by default; the editable HTML template is `src/page.html` and modular development is under `/dev/`.

Browser download tests verify the in-page file-saving flow. They do not establish that ChatGPT can export this cloud workspace as chat artifacts. This session has no attachment-registration/export tool, and earlier local `sandbox:` links were not a working chat delivery method.

The browser suite sets up two one-hit-away rounds for match-result checks; this validates the real simulation and UI transitions without claiming to be a full human-played match. Direct `file://` navigation was blocked by managed Chromium policy, so the exact standalone HTML was initially served locally for that check. Physical controller hardware and non-Chromium browsers were not tested. Original-engine equivalence is not claimed.
