"use strict";
// Heisig-Kanji: Daten und Lernlogik (ohne Oberfläche). Eigene Kartei, unabhängig von Geschichten
// und Lernkartei; gespeichert im Abschnitt db.heisig der Datenschicht.
// Die Rahmen werden strikt in Heisigs Reihenfolge freigeschaltet.

const Heisig = (() => {
  const KANJI = KANJI_DATA.map(([n, kanji, strokes, on, kun, en]) => ({ n, kanji, strokes, on, kun, en }));
  const byKanji = {};
  for (const k of KANJI) byKanji[k.kanji] = k;
  const TOTAL = KANJI.length;

  const h = () => Store.db.heisig;
  const frame = n => KANJI[n - 1];
  const cardOf = n => h().cards.find(c => c.frame === n);
  const entry = n => h().frames[n] || { keyword: "", story: "" };
  // Schlüsselwort aus dem Buch; ohne Eintrag dient die englische Bedeutung als Notlösung
  const keyword = n => entry(n).keyword || "";
  const promptText = n => keyword(n) || `(engl.) ${frame(n).en.split(", ")[0]}`;

  function status(n) {
    const c = cardOf(n);
    if (!c) return n <= h().unlocked ? "learned" : "locked";
    return `box${Scheduler.boxOf(c)}`;
  }

  // Gleiche Lernkartei-Regeln wie bei den Wörtern: erst die fälligen Kanji, Rückfälle belegen Plätze
  const deck = () => ({ cards: h().cards, reviews: h().reviews, activations: h().activations });
  const activatedToday = (now = Date.now()) => Scheduler.activatedToday(deck(), now);
  const lapsesToday = (now = Date.now()) => Scheduler.lapsesToday(deck(), now);
  const dueQueue = (now = Date.now()) => Scheduler.dueQueue(deck(), now);
  const dueTotal = (now = Date.now()) => Scheduler.dueTotal(deck(), now);
  const gateOpen = (now = Date.now()) => Scheduler.gateOpen(deck(), now);
  const practiceCards = (now = Date.now()) => Scheduler.practiceCards(deck(), now);
  const newAllowance = (now = Date.now()) => (gateOpen(now) ? Scheduler.allowance(deck(), now, h().newPerDay) : 0);
  const nextFrame = () => (h().unlocked < TOTAL ? h().unlocked + 1 : null);

  function makeCard(n, now) {
    return { ...Scheduler.newCard(String(n), null, now), id: `k-${n}`, frame: n };
  }

  // Nächsten Rahmen als gelernt eintragen (nur in Reihenfolge möglich)
  function learn(n, keywordText, story, now = Date.now()) {
    if (n !== nextFrame()) throw new Error(`Rahmen ${n} ist nicht der nächste (${nextFrame()})`);
    if (!gateOpen(now)) throw new Error("Erst die fälligen Kanji abfragen");
    h().frames[n] = { keyword: keywordText.trim(), story: story.trim() };
    if (!cardOf(n)) h().cards.push(makeCard(n, now));
    h().unlocked = n;
    h().activations[Scheduler.dayKey(now)] = activatedToday(now) + 1;
    Store.touchDay(now);
    Store.persist();
  }

  function saveEntry(n, keywordText, story) {
    h().frames[n] = { keyword: keywordText.trim(), story: story.trim() };
    Store.persist();
  }

  // Alle Rahmen bis n als schon gelernt übernehmen: Karten in Fach 3,
  // gestaffelt über zwei Wochen fällig, damit keine Lawine entsteht
  function markLearnedUntil(n, now = Date.now()) {
    n = Math.max(0, Math.min(TOTAL, n));
    let added = 0;
    for (let i = h().unlocked + 1; i <= n; i++) {
      if (cardOf(i)) continue;
      const c = makeCard(i, now);
      c.box = 3;
      c.dueAt = Scheduler.inDays(now, 1 + (added % 14));
      h().cards.push(c);
      added++;
    }
    h().unlocked = Math.max(h().unlocked, n);
    Store.persist();
    return added;
  }

  function review(cardId, rating, now = Date.now()) {
    const i = h().cards.findIndex(c => c.id === cardId);
    const { card, log } = Scheduler.review(h().cards[i], rating, now);
    h().cards[i] = card;
    h().reviews.push({ id: `kr-${h().reviews.length + 1}`, ...log });
    Store.touchDay(now);
    Store.persist();
    return card;
  }

  // Freies Üben in Fach 1 (ändert nichts an Fach oder Fälligkeit)
  function practice(cardId, rating, now = Date.now()) {
    const c = h().cards.find(x => x.id === cardId);
    h().reviews.push({ id: `kr-${h().reviews.length + 1}`, cardId, reviewedAt: now, rating, boxBefore: c.box, boxAfter: c.box, nextDueAt: c.dueAt, practice: true });
    Store.touchDay(now);
    Store.persist();
  }

  function setNewPerDay(n) { h().newPerDay = n; Store.persist(); }

  return {
    KANJI, TOTAL, frame, byKanji: k => byKanji[k] || null, cardOf, entry, keyword, promptText, status,
    activatedToday, lapsesToday, dueQueue, dueTotal, gateOpen, practiceCards, newAllowance, nextFrame,
    learn, saveEntry, markLearnedUntil, review, practice, setNewPerDay,
    get unlocked() { return h().unlocked; }, get newPerDay() { return h().newPerDay; },
  };
})();
