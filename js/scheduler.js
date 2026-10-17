"use strict";
// Wiederholungsplanung (erste, einfache Version). Reine Funktionen ohne Seiteneffekte,
// damit sie getestet und später durch FSRS ersetzt werden können.
//
// Lernphasen (state):
//   new        – frisch aktiviert, sofort fällig (Kennenlernen)
//   learning   – Lernschritte innerhalb derselben Lerneinheit (Minuten)
//   review     – Wiederholung im Tagesabstand
//   relearning – nach „Noch nicht“ aus review: kurzfristig erneut, dann zurück zu review
//
// Fächer (1–4) sind nur die sichtbare Darstellung und werden aus Phase + Intervall abgeleitet.

const Scheduler = (() => {
  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;
  const DAY_STARTS_AT = 4;               // ein Lerntag beginnt um 4 Uhr morgens
  const AGAIN_DELAY = 1 * MIN;           // „Noch nicht“ → in derselben Einheit nochmal
  const LEARN_DELAY = 3 * MIN;           // erster erfolgreicher Lernschritt
  const SESSION_WINDOW = 20 * MIN;       // so bald fällige Karten kommen in derselben Einheit wieder
  const MAX_NEW_PER_DAY = 12;
  const BOX_NAMES = ["", "Kennenlernen", "Aufbau", "Festigen", "Langzeit"];

  // Beginn des Lerntags, zu dem der Zeitpunkt t gehört
  function dayStart(t) {
    const d = new Date(t);
    if (d.getHours() < DAY_STARTS_AT) d.setDate(d.getDate() - 1);
    d.setHours(DAY_STARTS_AT, 0, 0, 0);
    return d.getTime();
  }
  // Fällig zu Beginn des Lerntags in n Tagen
  function inDays(now, n) {
    const d = new Date(dayStart(now));
    d.setDate(d.getDate() + n); // setDate statt +n*DAY: robust bei Sommer-/Winterzeit
    return d.getTime();
  }

  function newCard(vocabId, sentenceId, now) {
    return {
      id: `c-${vocabId}`, vocabId, sentenceId, state: "new", step: 0, intervalDays: 0,
      activatedAt: now, dueAt: now, lastReviewedAt: null,
      reviewCount: 0, correctCount: 0, lapseCount: 0,
    };
  }

  function boxOf(card) {
    if (card.state !== "review") return 1;
    if (card.intervalDays < 4) return 2;
    if (card.intervalDays < 21) return 3;
    return 4;
  }

  const nextInterval = days => (days < 1 ? 1 : Math.max(days + 1, Math.round(days * 2.5)));

  // rating: "again" (Noch nicht) | "good" (Gewusst). Gibt neue Karte + Logeintrag zurück.
  function review(card, rating, now) {
    const c = { ...card, reviewCount: card.reviewCount + 1, lastReviewedAt: now };
    const boxBefore = boxOf(card);
    const good = rating === "good";
    if (good) c.correctCount++;

    if (card.state === "new" || card.state === "learning") {
      if (!good) { c.state = "learning"; c.step = 0; c.dueAt = now + AGAIN_DELAY; }
      else if (card.step >= 1) { c.state = "review"; c.step = 0; c.intervalDays = 1; c.dueAt = inDays(now, 1); }
      else { c.state = "learning"; c.step = 1; c.dueAt = now + LEARN_DELAY; }
    } else if (card.state === "relearning") {
      if (good) { c.state = "review"; c.dueAt = inDays(now, c.intervalDays); }
      else c.dueAt = now + AGAIN_DELAY;
    } else { // review
      if (good) { c.intervalDays = nextInterval(card.intervalDays); c.dueAt = inDays(now, c.intervalDays); }
      else {
        c.state = "relearning";
        c.lapseCount++;
        c.intervalDays = Math.max(1, Math.floor(card.intervalDays / 2));
        c.dueAt = now + AGAIN_DELAY;
      }
    }
    const log = { cardId: card.id, reviewedAt: now, rating, boxBefore, boxAfter: boxOf(c), nextDueAt: c.dueAt };
    return { card: c, log };
  }

  const isDue = (card, now) => card.dueAt <= now;
  const comesBackInSession = (card, now) => card.dueAt - now <= SESSION_WINDOW;

  // Weniger neue Karten, wenn schon viele Wiederholungen anstehen
  function suggestedNewCount(dueReviews) {
    if (dueReviews >= 40) return 0;
    if (dueReviews >= 25) return 3;
    if (dueReviews >= 12) return 6;
    return MAX_NEW_PER_DAY;
  }

  return { MIN, DAY, MAX_NEW_PER_DAY, BOX_NAMES, dayStart, inDays, newCard, boxOf, review, isDue, comesBackInSession, suggestedNewCount, nextInterval };
})();
