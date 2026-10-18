"use strict";
// Abgleich des Lernstands über ein privates GitHub-Repository (z. B. binjeru/binjeru-daten).
// Der Lernstand liegt dort als Datei lernstand.json; Zugriff über die GitHub-API mit einem
// fein granularen Token (nur dieses Repo, Contents: Lesen und Schreiben).
// Token und Einstellungen liegen nur in diesem Browser (eigener localStorage-Schlüssel) und
// sind deshalb nie Teil einer Sicherung.
//
// Ablauf: Beim Start, beim Zurückkehren in die App und einige Sekunden nach jeder Änderung
// wird verglichen. „sha“ ist die Git-Prüfsumme des zuletzt abgeglichenen Stands, „rev“ zählt
// lokale Änderungen (keine Zeitstempel, damit abweichende Geräteuhren nichts durcheinanderbringen):
//   nur hier geändert     → hochladen
//   nur auf GitHub anders → übernehmen
//   beides                → Konflikt, die Person entscheidet im Profil

const Sync = (() => {
  const KEY = "binjeru-sync";
  const FILE = "lernstand.json";
  const API = "https://api.github.com";
  const DELAY = 4000;

  let cfg = load();
  let state = { status: cfg ? "idle" : "off", message: "", conflict: null };
  let timer = null, running = null, again = false;
  const listeners = [];

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  }
  function save() {
    try { cfg ? localStorage.setItem(KEY, JSON.stringify(cfg)) : localStorage.removeItem(KEY); } catch { /* privat */ }
  }
  function set(status, message = "") {
    state.status = status; state.message = message;
    listeners.forEach(fn => fn(state));
  }

  // ---------- Base64 für UTF-8 (auch für große Dateien) ----------
  function encode(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function decode(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // ---------- GitHub-API ----------
  async function api(path, opts = {}, c = cfg) {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${c.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const err = new Error(
        res.status === 401 ? "Token ungültig oder abgelaufen" :
        res.status === 403 ? "Keine Berechtigung (Token braucht „Contents: Read and write“ für dieses Repo)" :
        `GitHub antwortet mit Fehler ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  // ---------- Dateien im Daten-Repo (auch für eigene Geschichten, siehe own-stories.js) ----------
  function need() { if (!cfg) throw new Error("Der Abgleich über GitHub ist nicht eingerichtet (Profil der App)"); }
  async function getFile(path) {
    need();
    const file = await api(`/repos/${cfg.repo}/contents/${path}`);
    if (!file) return null;
    // Dateien über 1 MB liefert die Contents-API ohne Inhalt; dann über die Blob-API holen
    const b64 = file.content || (await api(`/repos/${cfg.repo}/git/blobs/${file.sha}`)).content;
    return { text: decode(b64), sha: file.sha };
  }
  async function putFile(path, text, message, sha = null) {
    need();
    const body = { message, content: encode(text) };
    if (sha) body.sha = sha;
    const res = await api(`/repos/${cfg.repo}/contents/${path}`, { method: "PUT", body: JSON.stringify(body) });
    return res.content.sha;
  }
  async function deleteFile(path, sha, message) {
    need();
    await api(`/repos/${cfg.repo}/contents/${path}`, { method: "DELETE", body: JSON.stringify({ message, sha }) });
  }
  async function listDir(path) {
    need();
    const res = await api(`/repos/${cfg.repo}/contents/${path}`);
    return Array.isArray(res) ? res : [];
  }

  // Liest lernstand.json → { data, text, sha } oder null, wenn es die Datei noch nicht gibt
  async function fetchRemote() {
    const file = await getFile(FILE);
    return file && { data: JSON.parse(file.text), text: file.text, sha: file.sha };
  }

  async function upload(sha) {
    const db = Store.db;
    const rev = cfg.rev;
    cfg.sha = await putFile(FILE, Store.exportJson(true), `Lernstand ${new Date(db.updatedAt || Date.now()).toLocaleString("de-CH")}`, sha);
    cfg.syncedRev = rev;
    cfg.lastSync = Date.now();
    save();
  }

  // Vor dem Übernehmen eines fremden Lernstands laufen diese Schritte (z. B. eigene Geschichten
  // holen, damit Karten aus neuen Geschichten ihre Wörter finden)
  const beforeAdopt = [];
  async function adopt(remote) {
    for (const fn of beforeAdopt) { try { await fn(); } catch (err) { console.warn(err); } }
    Store.importJson(remote.text, true);
    cfg.sha = remote.sha;
    cfg.syncedRev = cfg.rev;
    cfg.lastSync = Date.now();
    save();
    listeners.forEach(fn => fn(state, "imported"));
  }

  // ---------- Abgleich ----------
  async function run() {
    if (!cfg || state.conflict) return;
    if (!navigator.onLine) { set("offline", "Offline – wird später abgeglichen"); return; }
    set("busy");
    try {
      const remote = await fetchRemote();
      const dirty = cfg.rev > cfg.syncedRev;
      const remoteChanged = remote && remote.sha !== cfg.sha;
      if (!remote) await upload(null);
      else if (remoteChanged && !dirty) await adopt(remote);
      else if (remoteChanged && dirty) {
        // Erster Abgleich auf einem Gerät ohne eigenen Lernstand: einfach übernehmen
        if (!cfg.sha && isEmpty(Store.db)) await adopt(remote);
        else { state.conflict = { remote, local: Store.db.updatedAt }; set("conflict"); return; }
      } else if (dirty) await upload(remote.sha);
      set("ok");
    } catch (err) {
      if (err.status === 409 || err.status === 422) again = true;   // Datei wurde zwischendurch geändert
      set("error", err.message);
    }
  }
  function isEmpty(db) {
    return !db.cards.length && !db.saved.length && !db.reviews.length && !Object.keys(db.userVocab).length &&
      !db.heisig.cards.length && !Object.keys(db.heisig.frames).length;
  }

  function now() {
    if (!cfg) return Promise.resolve();
    clearTimeout(timer); timer = null;
    if (running) { again = true; return running; }
    running = run().finally(() => {
      running = null;
      if (again) { again = false; now(); }
    });
    return running;
  }
  function changed() {
    if (!cfg) return;
    cfg.rev++;
    save();
    schedule();
  }
  function schedule() {
    if (!cfg || state.conflict) return;
    clearTimeout(timer);
    timer = setTimeout(now, DELAY);
  }

  // Konflikt auflösen: "remote" = Stand von GitHub übernehmen, "local" = diesen Stand hochladen
  async function resolve(choice) {
    const c = state.conflict;
    if (!c) return;
    state.conflict = null;
    set("busy");
    try {
      if (choice === "remote") await adopt(c.remote);
      else await upload((await fetchRemote())?.sha);
      set("ok");
    } catch (err) { set("error", err.message); }
  }

  // Verbinden: prüft Repo und Token; öffentliche Repos werden abgelehnt (Lernstand enthält
  // eigene Heisig-Geschichten und Schlüsselwörter, die nicht öffentlich sein dürfen)
  async function connect(repo, token) {
    repo = repo.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "");
    token = token.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Repo bitte als „besitzer/name“ angeben");
    if (!token) throw new Error("Bitte ein Token eingeben");
    const info = await api(`/repos/${repo}`, {}, { token });
    if (!info) throw new Error("Repo nicht gefunden – oder das Token hat keinen Zugriff darauf");
    if (!info.private) throw new Error("Das Repo ist öffentlich. Bitte ein privates Repo verwenden.");
    // Ein vorhandener Lernstand zählt als lokale Änderung, damit er nicht stillschweigend überschrieben wird
    cfg = { repo, token, sha: null, rev: isEmpty(Store.db) ? 0 : 1, syncedRev: 0, lastSync: 0 };
    save();
    state.conflict = null;
    return now();
  }
  function disconnect() {
    clearTimeout(timer);
    cfg = null; state.conflict = null;
    save();
    set("off");
  }

  function start() {
    Store.onChange(changed);
    now();
    document.addEventListener("visibilitychange", () => {
      // Beim Verlassen ausstehende Änderungen sofort hochladen, beim Zurückkommen nachsehen
      if (document.hidden) { if (timer) now(); }
      else now();
    });
    window.addEventListener("online", () => now());
  }

  return {
    start, now, schedule, connect, disconnect, resolve,
    onUpdate: fn => listeners.push(fn),
    beforeAdopt: fn => beforeAdopt.push(fn),
    files: { get: getFile, put: putFile, del: deleteFile, list: listDir },
    get state() { return state; },
    get config() { return cfg && { repo: cfg.repo, lastSync: cfg.lastSync }; },
  };
})();
