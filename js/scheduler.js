"use strict";
// Wiederholungsplanung als Lernkartei mit 5 Fächern (Leitner-Prinzip). Reine Funktionen ohne
// Seiteneffekte, damit sie getestet und später erweitert (z. B. FSRS) werden können.
//
// Ablauf:
//   • Neue Karten kommen in Fach 1. Am selben Tag dürfen sie beliebig oft geübt werden – das zählt nicht.
//   • Ab dem nächsten Tag wird jede Karte bei Fälligkeit abgefragt („do or die“):
//       gewusst     → ein Fach weiter (Fach 5 bleibt Fach 5, dann alle 90 Tage)
//       nicht gewusst → zurück in Fach 1, am nächsten Tag wieder fällig
//   • Abstände nach dem Eintritt ins Fach: Fach 1 täglich, 2 → 2 Tage, 3 → 5, 4 → 14, 5 → 35 Tage.
//     Abstufung etwa ×2,5 wie bei SuperMemo/Anki; vgl. Cepeda u. a. (2008) zum Abstand im Verhältnis zur Behaltensdauer.
//   • Rückfälle aus Fach 2–5 belegen Plätze des Tageslimits für neue Karten.

const Scheduler = (() => {
  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;
  const DAY_STARTS_AT = 4;                           // ein Lerntag beginnt um 4 Uhr morgens
  const BOXES = 5;
  const INTERVALS = [0, 1, 2, 5, 14, 35];            // Tage bis zur Abfrage nach Eintritt ins Fach
  const LONG_TERM_INTERVAL = 90;                     // in Fach 5 gewusst → bleibt, wieder in 90 Tagen
  const MAX_NEW_PER_DAY = 12;
  const MAX_REVIEWS_PER_DAY = 50;                    // Obergrenze der Tagesabfrage (z. B. nach Pausen)
  const BOX_NAMES = ["", "Kennenlernen", "Aufbau", "Festigen", "Vertiefen", "Langzeit"];

  // Beginn des Lerntags, zu dem der Zeitpunkt t gehört
  function dayStart(t) {
    const d = new Date(t);
    if (d.getHours() < DAY_STARTS_AT) d.setDate(d.getDate() - 1);
    d.setHours(DAY_STARTS_AT, 0, 0, 0);
    return d.getTime();
  }
  // Beginn des Lerntags in n Tagen
  function inDays(now, n) {
    const d = new Date(dayStart(now));
    d.setDate(d.getDate() + n); // setDate statt +n*DAY: robust bei Sommer-/Winterzeit
    return d.getTime();
  }
  const sameDay = (a, b) => dayStart(a) === dayStart(b);

  function newCard(vocabId, sentenceId, now) {
    return {
      id: `c-${vocabId}`, vocabId, sentenceId, box: 1, dueAt: inDays(now, 1),
      activatedAt: now, lastReviewedAt: null, reviewCount: 0, correctCount: 0, lapseCount: 0,
    };
  }

  const boxOf = card => card.box;

  // Abfrage einer fälligen Karte. rating: "again" (Noch nicht) | "good" (Gewusst)
  function review(card, rating, now) {
    const c = { ...card, reviewCount: card.reviewCount + 1, lastReviewedAt: now };
    if (rating === "good") {
      c.correctCount++;
      if (card.box < BOXES) { c.box = card.box + 1; c.dueAt = inDays(now, INTERVALS[c.box]); }
      else c.dueAt = inDays(now, LONG_TERM_INTERVAL);
    } else {
      if (card.box > 1) c.lapseCount++;
      c.box = 1;
      c.dueAt = inDays(now, 1);
    }
    const log = { cardId: card.id, reviewedAt: now, rating, boxBefore: card.box, boxAfter: c.box, nextDueAt: c.dueAt };
    return { card: c, log };
  }

  const isDue = (card, now) => card.dueAt <= now;
  // Fach-1-Karten, die heute noch frei geübt werden können (Abfrage erst morgen)
  const isPracticable = (card, now) => card.box === 1 && card.dueAt > now;
  // Rückfall: aus Fach 2–5 nicht gewusst
  const isLapse = log => !log.practice && log.rating === "again" && log.boxBefore > 1;
  // Fach 1 zuerst, dann nach Fach und Fälligkeit
  const queueOrder = (a, b) => a.box - b.box || a.dueAt - b.dueAt;

  // Freie Plätze für neue Karten: Limit minus heute aktivierte minus heutige Rückfälle
  const newAllowance = (limit, activatedToday, lapsesToday) => Math.max(0, limit - activatedToday - lapsesToday);

  // Alte Karten (Version mit Lernphasen) auf Fächer abbilden
  function migrate(card) {
    if (card.box) return card;
    const box = card.state !== "review" ? 1 : card.intervalDays < 4 ? 2 : card.intervalDays < 21 ? 3 : 4;
    const { state, step, intervalDays, ...rest } = card;
    return { ...rest, box };
  }

  // ---------- Tagesstand einer Kartei { cards, reviews, activations } ----------
  const dayKey = now => todayStr(dayStart(now));
  const reviewsToday = (deck, now) => deck.reviews.filter(r => !r.practice && sameDay(r.reviewedAt, now));
  const lapsesToday = (deck, now) => reviewsToday(deck, now).filter(isLapse).length;
  const activatedToday = (deck, now) => deck.activations[dayKey(now)] || 0;
  const dueTotal = (deck, now) => deck.cards.filter(c => isDue(c, now)).length;
  // Heutige Pflichtabfrage: fällige Karten, Fach 1 zuerst, höchstens MAX_REVIEWS_PER_DAY pro Tag
  function dueQueue(deck, now) {
    const left = Math.max(0, MAX_REVIEWS_PER_DAY - reviewsToday(deck, now).length);
    return deck.cards.filter(c => isDue(c, now)).sort(queueOrder).slice(0, left);
  }
  // Freigabe für Geschichten und neue Karten: Pflichtabfrage erledigt (oder Tagesgrenze erreicht)
  const gateOpen = (deck, now) => dueQueue(deck, now).length === 0;
  const practiceCards = (deck, now) => deck.cards.filter(c => isPracticable(c, now));
  const allowance = (deck, now, limit) => newAllowance(limit, activatedToday(deck, now), lapsesToday(deck, now));

  return {
    MIN, DAY, BOXES, INTERVALS, LONG_TERM_INTERVAL, MAX_NEW_PER_DAY, MAX_REVIEWS_PER_DAY, BOX_NAMES,
    dayStart, inDays, sameDay, newCard, boxOf, review, isDue, isPracticable, isLapse, queueOrder, newAllowance, migrate,
    dayKey, reviewsToday, lapsesToday, activatedToday, dueTotal, dueQueue, gateOpen, practiceCards, allowance,
  };
})();
