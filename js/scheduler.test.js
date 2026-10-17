"use strict";
// Automatisierte Tests für Wiederholungsplanung und Inhalts-Hilfsfunktionen. Aufruf: tests.html öffnen.

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, msg: e.message }); }
}
function eq(actual, expected, label = "") {
  if (actual !== expected) throw new Error(`${label} erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`);
}

const S = Scheduler;
const T0 = new Date(2026, 9, 17, 10, 0).getTime(); // 17.10.2026, 10:00
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();

test("Neue Karte ist sofort fällig und in Fach 1", () => {
  const c = S.newCard("約束", "himitsu/1/5", T0);
  eq(c.state, "new"); eq(c.dueAt, T0); eq(S.boxOf(c), 1); eq(S.isDue(c, T0), true);
});

test("Gewusst beim Kennenlernen → nach 3 Minuten in derselben Einheit", () => {
  const { card, log } = S.review(S.newCard("約束", null, T0), "good", T0);
  eq(card.state, "learning"); eq(card.dueAt, T0 + 3 * S.MIN); eq(S.boxOf(card), 1);
  eq(S.comesBackInSession(card, T0), true); eq(log.boxBefore, 1); eq(log.boxAfter, 1);
});

test("Noch nicht beim Kennenlernen → nach 1 Minute erneut", () => {
  const { card } = S.review(S.newCard("約束", null, T0), "again", T0);
  eq(card.state, "learning"); eq(card.step, 0); eq(card.dueAt, T0 + S.MIN);
});

test("Zweites Gewusst → am nächsten Tag (4 Uhr), Fach 2", () => {
  let c = S.newCard("約束", null, T0);
  c = S.review(c, "good", T0).card;
  c = S.review(c, "good", T0 + 3 * S.MIN).card;
  eq(c.state, "review"); eq(c.intervalDays, 1); eq(c.dueAt, at(18, 4)); eq(S.boxOf(c), 2);
  eq(S.comesBackInSession(c, T0 + 3 * S.MIN), false);
});

test("Intervalle wachsen: 1 → 3 → 8 → 20 → 50 Tage, Fächer 2 → 2 → 3 → 3 → 4", () => {
  let c = { ...S.newCard("x", null, T0), state: "review", intervalDays: 1 };
  const expected = [[3, 2], [8, 3], [20, 3], [50, 4]];
  for (const [days, box] of expected) {
    c = S.review(c, "good", T0).card;
    eq(c.intervalDays, days, "Intervall"); eq(S.boxOf(c), box, "Fach");
  }
});

test("Noch nicht in der Wiederholung → relearning, Fach 1, halbes Intervall, Lapse gezählt", () => {
  const c0 = { ...S.newCard("x", null, T0), state: "review", intervalDays: 20 };
  const { card, log } = S.review(c0, "again", T0);
  eq(card.state, "relearning"); eq(card.intervalDays, 10); eq(card.lapseCount, 1);
  eq(card.dueAt, T0 + S.MIN); eq(log.boxBefore, 3); eq(log.boxAfter, 1);
  const back = S.review(card, "good", T0 + S.MIN).card;
  eq(back.state, "review"); eq(back.dueAt, at(27, 4)); eq(S.boxOf(back), 3);
});

test("Zähler für Wiederholungen und richtige Antworten", () => {
  let c = S.newCard("x", null, T0);
  c = S.review(c, "again", T0).card;
  c = S.review(c, "good", T0).card;
  eq(c.reviewCount, 2); eq(c.correctCount, 1); eq(c.lastReviewedAt, T0);
});

test("Lerntag beginnt um 4 Uhr", () => {
  eq(S.dayStart(at(18, 2)), at(17, 4));
  eq(S.dayStart(at(18, 5)), at(18, 4));
  eq(S.inDays(at(18, 2), 1), at(18, 4)); // 2 Uhr nachts zählt noch zum Vortag
});

test("Weniger neue Karten bei vielen fälligen Wiederholungen", () => {
  eq(S.suggestedNewCount(0), 12); eq(S.suggestedNewCount(11), 12); eq(S.suggestedNewCount(12), 6);
  eq(S.suggestedNewCount(25), 3); eq(S.suggestedNewCount(40), 0);
});

test("Review-Funktion verändert die Eingabekarte nicht", () => {
  const c = S.newCard("x", null, T0);
  S.review(c, "good", T0);
  eq(c.state, "new"); eq(c.reviewCount, 0);
});

test("Furigana lässt Okurigana weg", () => {
  eq(furiganaHtml("忘れました", "わすれました"), "<ruby>忘<rt>わす</rt></ruby>れました");
  eq(furiganaHtml("お誕生日", "おたんじょうび"), "お<ruby>誕生日<rt>たんじょうび</rt></ruby>");
  eq(furiganaHtml("今日", "きょう"), "<ruby>今日<rt>きょう</rt></ruby>");
  eq(furiganaHtml("ねこ", "ねこ"), "ねこ");
});

test("Romaji-Umschrift", () => {
  eq(kanaToRomaji("やくそく"), "yakusoku");
  eq(kanaToRomaji("がっこう"), "gakkou");
  eq(kanaToRomaji("しゃしん"), "shashin");
  eq(kanaToRomaji("パーティー"), "paatii");
  eq(kanaToRomaji("まっちゃ"), "matcha");
});

test("Alle Wörter der Geschichten sind im Wörterbuch", () => {
  for (const story of Content.stories) for (const s of story.flat) s.tokens.forEach((t, i) => {
    if (!/^[。、「」！？…\s]+$/.test(t)) {
      if (!DICT[t]) throw new Error(`fehlt: ${t} (${s.id})`);
      if (!DICT[s.vocabIds[i]]) throw new Error(`Grundform fehlt: ${s.vocabIds[i]}`);
    }
  });
});

test("約束 und 秘密 kommen mehrfach in der Testgeschichte vor", () => {
  const story = Content.story("himitsu");
  if (story.freq["約束"] < 3) throw new Error(`約束: ${story.freq["約束"]}`);
  if (story.freq["秘密"] < 3) throw new Error(`秘密: ${story.freq["秘密"]}`);
  eq(Content.storyVocab("himitsu").slice(0, 3).includes("約束"), true, "約束 unter den 3 häufigsten Wörtern");
});

test("Häufigkeitsrang: häufige Wörter vor seltenen, Wörter ohne Rang zuletzt", () => {
  eq(Content.rank("約束"), FREQ_RANK["約束"]);
  const sorted = ["秘密", "ドイツ人", "人", "約束"].sort(Content.byRank);
  eq(sorted[0], "人"); eq(sorted[sorted.length - 1], "ドイツ人");
});

const failed = results.filter(r => !r.ok).length;
document.getElementById("summary").innerHTML = failed
  ? `<span class="fail">${failed} von ${results.length} Tests fehlgeschlagen</span>`
  : `<span class="ok">Alle ${results.length} Tests bestanden ✓</span>`;
document.getElementById("out").innerHTML = results.map(r =>
  `<div class="${r.ok ? "ok" : "fail"}">${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : ` – ${r.msg}`}</div>`).join("");
