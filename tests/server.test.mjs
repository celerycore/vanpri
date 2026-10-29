import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createGameServer } from '../server.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function withServer(basePath, callback) {
  const server = createGameServer({ basePath });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('ZIP endpoint sends an attachment with the complete release bytes', async () => {
  await withServer('', async origin => {
    const response = await fetch(origin + '/dist/downloads/Vanguard-Princess-Playable.zip');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/zip');
    assert.match(response.headers.get('content-disposition'), /attachment; filename="Vanguard-Princess-Playable.zip"/);
    const received = Buffer.from(await response.arrayBuffer());
    const expected = await readFile(new URL('../dist/downloads/Vanguard-Princess-Playable.zip', import.meta.url));
    assert.equal(Number(response.headers.get('content-length')), received.length);
    assert.equal(hash(received), hash(expected));
  });
});

test('HTML download is an attachment while website HTML remains playable inline', async () => {
  await withServer('', async origin => {
    const download = await fetch(origin + '/dist/Vanguard-Princess.html?download=1', { method: 'HEAD' });
    assert.match(download.headers.get('content-disposition'), /attachment; filename="Vanguard-Princess.html"/);
    assert.match(download.headers.get('content-type'), /text\/html/);
    const page = await fetch(origin + '/dist/index.html', { method: 'HEAD' });
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('content-disposition'), null);
  });
});

test('nested website mount redirects and serves relative game resources and downloads', async () => {
  await withServer('/games/vanpri/', async origin => {
    const redirect = await fetch(origin + '/games/vanpri', { redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), '/games/vanpri/');
    const page = await fetch(origin + '/games/vanpri/');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /data-standalone/);
    assert.match(html, /const GAME_MANIFEST = /);
    assert.doesNotMatch(html, /src="\.\/src\/app.js"/);
    const development = await fetch(origin + '/games/vanpri/dev/');
    assert.match(await development.text(), /src="\.\/src\/app.js"/);
    const manifest = await fetch(origin + '/games/vanpri/assets/manifest.json').then(r => r.json());
    assert.equal(manifest.characters.length, 10);
    const download = await fetch(origin + '/games/vanpri/dist/downloads/Vanguard-Princess-Playable.zip', { method: 'HEAD' });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'application/zip');
    assert.equal((await fetch(origin + '/assets/manifest.json')).status, 404);
  });
});
