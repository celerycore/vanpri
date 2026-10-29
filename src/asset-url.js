// A standalone build embeds the very same assets; development serves them normally.
export function assetUrl(name) {
  return globalThis.__VANGUARD_BUNDLE__?.[name] || new URL('./assets/' + name, document.baseURI).href;
}
