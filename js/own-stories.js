"use strict";
// Eigene Geschichten: liegen im privaten Daten-Repo (Ordner geschichten/, je Geschichte eine JSON-Datei
// { catalog, story }) und werden von der Werkstatt dorthin übernommen. Die App hält eine Kopie im
// Browser, damit sie sofort und auch offline da sind, und gleicht sie über js/sync.js ab.

const OwnStories = (() => {
  const KEY = "binjeru-eigene-geschichten";
  const DIR = "geschichten";
  const MIN_GAP = 60 * 1000;   // höchstens einmal pro Minute nachsehen

  let cache = load();          // id → { sha, data: { catalog, story } }
  let lastRefresh = 0, refreshing = null;
  const listeners = [];

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { console.warn("Eigene Geschichten konnten nicht gespeichert werden"); }
  }
  const apply = id => Content.addOwn(cache[id].data.catalog, cache[id].data.story);
  const changed = () => listeners.forEach(fn => fn());

  for (const id of Object.keys(cache)) apply(id);

  // Liste im Repo mit der Kopie vergleichen; geänderte Geschichten holen, gelöschte entfernen.
  // Ergebnis: true, wenn sich etwas geändert hat.
  function refresh(force = false) {
    if (!Sync.config) return Promise.resolve(false);
    if (refreshing) return refreshing;
    if (!force && Date.now() - lastRefresh < MIN_GAP) return Promise.resolve(false);
    refreshing = (async () => {
      const files = (await Sync.files.list(DIR)).filter(f => f.type === "file" && f.name.endsWith(".json"));
      let any = false;
      const seen = new Set();
      for (const f of files) {
        const id = f.name.replace(/\.json$/, "");
        seen.add(id);
        if (cache[id] && cache[id].sha === f.sha) continue;
        const file = await Sync.files.get(`${DIR}/${f.name}`);
        if (!file) continue;
        cache[id] = { sha: file.sha, data: JSON.parse(file.text) };
        apply(id);
        any = true;
      }
      for (const id of Object.keys(cache)) {
        if (!seen.has(id)) { delete cache[id]; Content.removeOwn(id); any = true; }
      }
      lastRefresh = Date.now();
      if (any) { save(); changed(); }
      return any;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  // Aus der Werkstatt: Geschichte ins Repo schreiben (vorhandene mit gleicher ID wird ersetzt)
  async function publish(data) {
    const id = data.catalog.id;
    const path = `${DIR}/${id}.json`;
    const existing = await Sync.files.get(path);
    const sha = await Sync.files.put(path, JSON.stringify(data), `Geschichte „${data.catalog.titleJp}“ (${id})`, existing && existing.sha);
    cache[id] = { sha, data };
    save();
    apply(id);
    changed();
    return { replaced: !!existing };
  }

  async function remove(id) {
    const path = `${DIR}/${id}.json`;
    const existing = await Sync.files.get(path);
    if (existing) await Sync.files.del(path, existing.sha, `Geschichte ${id} gelöscht`);
    delete cache[id];
    save();
    Content.removeOwn(id);
    changed();
  }

  return {
    refresh, publish, remove,
    has: id => !!cache[id],
    get list() { return Object.values(cache).map(c => c.data.catalog); },
    onChange: fn => listeners.push(fn),
  };
})();

// Bevor ein Lernstand von einem anderen Gerät übernommen wird, erst dessen Geschichten holen
if (typeof Sync !== "undefined") Sync.beforeAdopt(() => OwnStories.refresh(true));
