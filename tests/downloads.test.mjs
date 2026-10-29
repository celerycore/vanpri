import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { createZip, crc32 } from '../src/zip.js';
import { gameFiles } from '../src/downloads.js';
import { readFileSync } from 'node:fs';
import { GAME_MANIFEST } from '../src/game-manifest.js';

test('embedded game manifest matches all prepared asset metadata', () => {
  const original = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url)));
  assert.deepEqual(GAME_MANIFEST, original);
  assert.equal(GAME_MANIFEST.characters.length, 10);
});

function extractLocalEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = {};
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const start = offset + 30 + nameLength + extraLength;
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const payload = bytes.subarray(start, start + size);
    const data = method === 8 ? inflateRawSync(payload) : payload;
    assert.equal(data.length, view.getUint32(offset + 22, true));
    assert.equal(crc32(data), view.getUint32(offset + 14, true));
    files[name] = new TextDecoder().decode(data);
    offset = start + size;
  }
  assert.equal(view.getUint32(offset, true), 0x02014b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  return files;
}

test('ZIP CRC matches the standard check vector', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('browser ZIP preserves a complete game, instructions and attribution', () => {
  const html = '<!doctype html><html><body>Game 日本語</body></html>';
  const files = extractLocalEntries(createZip(gameFiles(html)));
  assert.equal(files['Vanguard-Princess.html'], html);
  assert.match(files['PLAY.txt'], /open Vanguard-Princess.html/);
  assert.match(files['NOTICE.txt'], /Tomoaki Sugeno/);
});

test('release ZIP supports independently deflated UTF-8 files and empty files', () => {
  const data = new TextEncoder().encode('A complete offline game. '.repeat(100));
  const files = extractLocalEntries(createZip([{ name: 'ゲーム/index.html', data, compressed: deflateRawSync(data) }, { name: 'empty.txt', data: '' }]));
  assert.equal(files['ゲーム/index.html'], new TextDecoder().decode(data));
  assert.equal(files['empty.txt'], '');
});

test('ZIP rejects duplicate and escaping filenames', () => {
  for (const name of ['/game.html', '../game.html', 'game/../game.html', 'game\\file.html']) assert.throws(() => createZip([{ name, data: 'game' }]), /filename/);
  assert.throws(() => createZip([{ name: 'game.html', data: 'a' }, { name: 'game.html', data: 'b' }]), /filename/);
});
