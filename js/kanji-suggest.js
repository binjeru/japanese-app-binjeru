"use strict";
// Vorschläge für die Heisig-Kartei: Schlüsselwort und Merkgeschichte je Rahmen aus dem eigenen
// Anki-Deck. Sie liegen nur im privaten Daten-Repo (kanji-vorschlaege.json) – Heisigs Schlüsselwörter
// sind urheberrechtlich geschützt und gehören nicht ins öffentliche App-Repo. Die App hält eine Kopie
// im Browser und holt beim Abgleich eine neuere Fassung.

const KanjiSuggest = (() => {
  const KEY = "binjeru-kanji-vorschlaege";
  const FILE = "kanji-vorschlaege.json";
  const MIN_GAP = 10 * 60 * 1000;   // höchstens alle 10 Minuten nachsehen

  let cache = load();   // { sha, data: { "1": { kw, s }, … } }
  let lastRefresh = 0, refreshing = null;
  const listeners = [];

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
  }

  // Ergebnis: true, wenn neue Vorschläge geladen wurden
  function refresh(force = false) {
    if (typeof Sync === "undefined" || !Sync.config) return Promise.resolve(false);
    if (refreshing) return refreshing;
    if (!force && Date.now() - lastRefresh < MIN_GAP) return Promise.resolve(false);
    refreshing = (async () => {
      const list = await Sync.files.list("");
      const meta = list.find(f => f.name === FILE);
      lastRefresh = Date.now();
      if (!meta || (cache && cache.sha === meta.sha)) return false;
      const file = await Sync.files.get(FILE);
      cache = { sha: file.sha, data: JSON.parse(file.text) };
      try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { console.warn("Kanji-Vorschläge konnten nicht gespeichert werden"); }
      listeners.forEach(fn => fn());
      return true;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  return {
    refresh,
    get: n => (cache && cache.data[n]) || null,
    get count() { return cache ? Object.keys(cache.data).length : 0; },
    onChange: fn => listeners.push(fn),
  };
})();
