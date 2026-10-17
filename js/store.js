"use strict";
// Datenschicht: speichert den gesamten Lernstand im localStorage.
// Entspricht dem Datenmodell aus dem PRD (UserVocabulary, SavedWord, Flashcard, ReviewLog, StoryProgress).
// Wortstatus wird aus Lernkartei/Merkliste abgeleitet, damit er nie widersprüchlich ist.

const Store = (() => {
  const KEY = "monogatari-v1";
  const fresh = () => ({
    version: 1,
    userVocab: {},     // vocabId → { known, firstSeenAt, lastSeenAt, encounterCount }
    saved: [],         // SavedWord: { id, vocabId, sentenceId, savedAt, source: "manual" | "check" }
    cards: [],         // Flashcard (siehe Scheduler.newCard)
    reviews: [],       // ReviewLog
    progress: {},      // storyId → { position, lastPlayedAt, listenCount, completedCount }
    activations: {},   // Datum → Anzahl aktivierter Karten
    days: [],          // Tage mit Lernaktivität
    kana: {},          // Kana-Übungsstatistik
    prefs: { furi: true, romaji: false, de: false, speed: "1", mode: "read", topics: [] },
    currentStoryId: null,
  });

  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  const isNew = !db;
  db = Object.assign(fresh(), db || {});
  db.prefs = Object.assign(fresh().prefs, db.prefs);

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* z. B. privater Modus */ }
  }

  // Übernimmt Kana-Statistik und aus Geschichten gesammelte Wörter der alten Version
  function migrateFromOldApp() {
    let old;
    try { old = JSON.parse(localStorage.getItem("binjeru-v1")); } catch { return; }
    if (!old) return;
    db.kana = old.kana || {};
    db.days = old.days || [];
    for (const c of old.custom || []) {
      const vid = Object.keys(DICT).find(k => !DICT[k].base && DICT[k].r === c.kana);
      if (vid) saveWord(vid, null, "manual", false);
    }
    persist();
  }

  function touchDay(now = Date.now()) {
    const t = todayStr(now);
    if (!db.days.includes(t)) db.days.push(t);
  }

  // ---------- Wortstatus ----------
  const cardOf = vid => db.cards.find(c => c.vocabId === vid);
  const savedOf = vid => db.saved.find(s => s.vocabId === vid);
  function status(vid) {
    if (cardOf(vid)) return "active";
    if (savedOf(vid)) return "saved";
    if (db.userVocab[vid] && db.userVocab[vid].known) return "known";
    return "unknown";
  }
  function uv(vid) {
    return db.userVocab[vid] || (db.userVocab[vid] = { known: false, firstSeenAt: null, lastSeenAt: null, encounterCount: 0 });
  }
  function setKnown(vid, known) {
    uv(vid).known = known;
    persist();
  }
  function encounter(vids, now = Date.now()) {
    for (const vid of new Set(vids)) {
      const u = uv(vid);
      u.firstSeenAt = u.firstSeenAt || now;
      u.lastSeenAt = now;
      u.encounterCount++;
    }
    persist();
  }

  // ---------- Merkliste ----------
  function saveWord(vid, sentenceId, source, doPersist = true) {
    if (cardOf(vid) || savedOf(vid)) return false; // keine Duplikate
    db.saved.push({ id: `w-${vid}`, vocabId: vid, sentenceId, savedAt: Date.now(), source });
    if (doPersist) persist();
    return true;
  }
  function unsave(vid) {
    db.saved = db.saved.filter(s => s.vocabId !== vid);
    persist();
  }

  // ---------- Lernkartei ----------
  const activatedToday = (now = Date.now()) => db.activations[todayStr(now)] || 0;
  const dueCards = (now = Date.now()) => db.cards.filter(c => Scheduler.isDue(c, now)).sort((a, b) => a.dueAt - b.dueAt);
  const dueReviewCount = (now = Date.now()) => dueCards(now).filter(c => c.state === "review" || c.state === "relearning").length;
  function newAllowance(now = Date.now()) {
    return Math.max(0, Scheduler.suggestedNewCount(dueReviewCount(now)) - activatedToday(now));
  }
  function activate(vids, now = Date.now()) {
    const allowed = newAllowance(now);
    let n = 0;
    for (const vid of vids) {
      if (n >= allowed || cardOf(vid)) continue;
      const s = savedOf(vid);
      db.cards.push(Scheduler.newCard(vid, s ? s.sentenceId : null, now));
      db.saved = db.saved.filter(x => x.vocabId !== vid);
      db.activations[todayStr(now)] = activatedToday(now) + 1;
      n++;
    }
    persist();
    return n;
  }
  function review(cardId, rating, supportMode, now = Date.now()) {
    const i = db.cards.findIndex(c => c.id === cardId);
    const { card, log } = Scheduler.review(db.cards[i], rating, now);
    db.cards[i] = card;
    db.reviews.push({ id: `r-${db.reviews.length + 1}`, ...log, supportMode });
    touchDay(now);
    persist();
    return card;
  }

  // ---------- Geschichten-Fortschritt ----------
  function progress(storyId) {
    return db.progress[storyId] || { position: 0, lastPlayedAt: null, listenCount: 0, completedCount: 0 };
  }
  function setPosition(storyId, position) {
    const p = progress(storyId);
    p.position = position;
    p.lastPlayedAt = Date.now();
    db.progress[storyId] = p;
    db.currentStoryId = storyId;
    touchDay();
    persist();
  }
  function startedListening(storyId) {
    const p = progress(storyId);
    p.listenCount++;
    db.progress[storyId] = p;
    persist();
  }
  function completed(storyId) {
    const p = progress(storyId);
    p.completedCount++;
    p.position = 0;
    db.progress[storyId] = p;
    persist();
  }

  // ---------- Statistik ----------
  function streak() {
    const days = new Set(db.days);
    const d = new Date();
    if (!days.has(todayStr(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (days.has(todayStr(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // ---------- Sicherung ----------
  function exportJson() { return JSON.stringify(db, null, 1); }
  function importJson(text) {
    const data = JSON.parse(text);
    if (!data || data.version !== 1 || !Array.isArray(data.cards)) throw new Error("Keine gültige Sicherung");
    db = Object.assign(fresh(), data);
    persist();
  }
  function reset() {
    db = Object.assign(fresh(), { prefs: db.prefs });
    persist();
  }

  if (isNew) migrateFromOldApp();

  return {
    get db() { return db; }, persist, touchDay,
    status, setKnown, encounter, saveWord, unsave, savedOf, cardOf,
    activatedToday, dueCards, dueReviewCount, newAllowance, activate, review,
    progress, setPosition, startedListening, completed, streak,
    exportJson, importJson, reset,
  };
})();
