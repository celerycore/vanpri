# Public website deployment

The game is prepared for GitHub Pages in `celerycore/vanpri`.

## Pages configuration

Use **Settings → Pages → Build and deployment**:

- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/ (root)**

The generated root `index.html` includes the complete game. `.nojekyll` ensures GitHub serves the files directly. No Node server, package installation, API key or external asset host is needed to play the public site. The in-page download buttons create the offline game and ZIP in the browser.

The expected address after successful Pages activation is `https://celerycore.github.io/vanpri/`. This is a deployment target, not a claim that the site is already live. Check the Pages status and make a real browser request after activation.

## Updating the website

Change source in `src/` and the HTML template in `src/page.html`, then run:

```sh
npm run build
npm test
```

Commit the updated source, generated `src/game-manifest.js` and root `index.html`, then push `main`. GitHub Pages publishes the updated root. Build output in `dist/` is optional for hosting; the root page contains every runtime asset.

## Activating through the API

If Pages is not enabled yet, a repository administrator can create a branch-based Pages site with:

```sh
gh api --method POST repos/celerycore/vanpri/pages \
  -f 'source[branch]=main' -f 'source[path]=/' -f build_type=legacy
```

If it already exists, read its settings first and use PATCH only when necessary. The running cloud environment must allow `api.github.com` for configuration and `celerycore.github.io` for verification. Use existing injected GitHub authentication; do not put tokens in this project or any site file. Enabling Pages may depend on the repository owner's plan and permissions; do not change repository visibility or enroll in paid hosting automatically.

Publishing a cloud development environment is separate from enabling this public GitHub Pages site.
