import { createZip } from './zip.js';

export function gameFiles(html) {
  return [
    { name: 'Vanguard-Princess.html', data: html },
    { name: 'PLAY.txt', data: 'VANGUARD PRINCESS — BROWSER ARENA\n\nExtract this ZIP, then open Vanguard-Princess.html in a modern browser.\nThe HTML contains the entire game. No installation or network connection is needed.\n\nW A S D: move, jump, crouch\nJ / K / L: light, medium, heavy\nU: special | I: assist | O: Liberty Art | Space: guard\nK + L: close throw | Escape: pause | R: reset training\nPlayer two: arrows, 1 / 2 / 3 attacks, 4 special, 5 assist, 6 Liberty, 0 guard.\nUse How to play for more help.\n\nThis is a new combat adaptation using the supplied original artwork and music.\n' },
    { name: 'NOTICE.txt', data: 'Original Vanguard Princess © Tomoaki Sugeno. Licensed by eigoMANGA. All rights reserved.\nOriginal artwork and audio remain the property of their respective owners.\nBrowser combat and UI are a new adaptation, not the original 2D Fighter Maker engine.\n' },
  ];
}

async function gameDocument() {
  if (globalThis.__VANGUARD_SOURCE__) return globalThis.__VANGUARD_SOURCE__;
  const response = await fetch(new URL('./dist/Vanguard-Princess.html', document.baseURI));
  if (!response.ok) throw new Error('The offline file could not be downloaded. Please try again.');
  const html = await response.text();
  if (!html.includes('globalThis.__VANGUARD_BUNDLE__=')) throw new Error('The offline file is missing. Please use the complete website build.');
  return html;
}

export function setupDownloads() {
  const links = [...document.querySelectorAll('[data-download]')];
  const status = document.getElementById('download-status');
  let busy = false;
  for (const link of links) link.addEventListener('click', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    for (const item of links) { item.setAttribute('aria-disabled', 'true'); item.setAttribute('aria-busy', 'true'); }
    status.textContent = 'Preparing your download…';
    try {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const html = await gameDocument();
      const zip = link.dataset.download === 'zip';
      const blob = new Blob([zip ? createZip(gameFiles(html)) : html], { type: zip ? 'application/zip' : 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = zip ? 'Vanguard-Princess-Playable.zip' : 'Vanguard-Princess.html';
      anchor.hidden = true;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = zip ? 'Download started. Extract the ZIP, then open Vanguard-Princess.html to play.' : 'Download started. Open Vanguard-Princess.html in your browser to play.';
    } catch (error) {
      status.textContent = error.message || 'The download could not start. Please try again.';
    } finally {
      busy = false;
      for (const item of links) { item.removeAttribute('aria-disabled'); item.removeAttribute('aria-busy'); }
    }
  });
}
