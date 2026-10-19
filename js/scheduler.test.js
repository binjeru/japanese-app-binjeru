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
const card = (box, dueAt = T0) => ({ ...S.newCard(`x${box}-${dueAt}`, null, T0), box, dueAt });

// ---------- Lernkartei (5 Fächer) ----------
test("Neue Karte: Fach 1, heute frei übbar, Abfrage erst morgen um 4 Uhr", () => {
  const c = S.newCard("約束", "himitsu/1/5", T0);
  eq(c.box, 1); eq(c.dueAt, at(18, 4));
  eq(S.isDue(c, T0), false, "heute nicht fällig"); eq(S.isPracticable(c, T0), true, "heute übbar");
  eq(S.isDue(c, at(18, 9)), true, "morgen fällig"); eq(S.isPracticable(c, at(18, 9)), false);
});

test("Gewusst: ein Fach weiter mit 2 · 5 · 14 · 35 Tagen, in Fach 5 dann alle 90 Tage", () => {
  let c = card(1);
  let now = T0;
  for (const [box, days] of [[2, 2], [3, 5], [4, 14], [5, 35], [5, 90], [5, 90]]) {
    const r = S.review(c, "good", now);
    eq(r.card.box, box, "Fach"); eq(r.card.dueAt, S.inDays(now, days), `Abstand in Fach ${box}`);
    c = r.card; now = c.dueAt + 5 * 3600e3;
  }
});

test("Nicht gewusst in Fach 2–5: zurück in Fach 1 (do or die), morgen wieder fällig, zählt als Rückfall", () => {
  for (const box of [2, 3, 4, 5]) {
    const { card: c, log } = S.review(card(box), "again", T0);
    eq(c.box, 1); eq(c.dueAt, at(18, 4)); eq(c.lapseCount, 1);
    eq(log.boxBefore, box); eq(log.boxAfter, 1); eq(S.isLapse(log), true);
    eq(S.isPracticable(c, T0), true, "heute in Fach 1 übbar");
  }
});

test("Nicht gewusst in Fach 1: bleibt in Fach 1, kein Rückfall", () => {
  const { card: c, log } = S.review(card(1), "again", T0);
  eq(c.box, 1); eq(c.lapseCount, 0); eq(S.isLapse(log), false); eq(c.dueAt, at(18, 4));
});

test("Zähler und unveränderte Eingabekarte", () => {
  const c0 = card(2);
  let c = S.review(c0, "again", T0).card;
  c = S.review(c, "good", at(18, 9)).card;
  eq(c.reviewCount, 2); eq(c.correctCount, 1); eq(c0.reviewCount, 0); eq(c0.box, 2);
});

test("Lerntag beginnt um 4 Uhr", () => {
  eq(S.dayStart(at(18, 2)), at(17, 4));
  eq(S.dayStart(at(18, 5)), at(18, 4));
  eq(S.inDays(at(18, 2), 1), at(18, 4)); // 2 Uhr nachts zählt noch zum Vortag
});

test("Tagesabfrage: Fach 1 zuerst, höchstens 50 pro Tag, danach freigegeben", () => {
  const cards = [card(3, at(16, 4)), card(1, at(17, 4)), card(2, at(15, 4))];
  for (let i = 0; i < 60; i++) cards.push(card(4, at(10, 4)));
  const deck = { cards, reviews: [], activations: {} };
  const q = S.dueQueue(deck, T0);
  eq(q.length, 50); eq(q[0].box, 1); eq(q[1].box, 2); eq(q[2].box, 3);
  eq(S.gateOpen(deck, T0), false);
  for (let i = 0; i < 50; i++) deck.reviews.push({ reviewedAt: T0, rating: "good", boxBefore: 4, boxAfter: 5 });
  eq(S.dueQueue(deck, T0).length, 0, "Tagesgrenze erreicht"); eq(S.gateOpen(deck, T0), true);
  eq(S.dueTotal(deck, T0), 63, "Rest bleibt fällig für morgen");
});

test("Üben zählt nicht für die Tagesgrenze", () => {
  const deck = { cards: [card(2, at(16, 4))], reviews: [{ reviewedAt: T0, rating: "good", boxBefore: 1, boxAfter: 1, practice: true }], activations: {} };
  eq(S.reviewsToday(deck, T0).length, 0); eq(S.gateOpen(deck, T0), false);
});

test("Neue Karten: 12 pro Tag minus heute aktivierte minus Rückfälle", () => {
  const deck = { cards: [], reviews: [], activations: { [S.dayKey(T0)]: 4 } };
  eq(S.allowance(deck, T0, 12), 8);
  deck.reviews.push({ reviewedAt: T0, rating: "again", boxBefore: 3, boxAfter: 1 });
  deck.reviews.push({ reviewedAt: T0, rating: "again", boxBefore: 1, boxAfter: 1 }); // kein Rückfall
  deck.reviews.push({ reviewedAt: at(16, 9), rating: "again", boxBefore: 2, boxAfter: 1 }); // gestern
  eq(S.allowance(deck, T0, 12), 7);
  eq(S.newAllowance(12, 10, 5), 0, "nie negativ");
});

test("Alte Karten werden auf Fächer abgebildet", () => {
  eq(S.migrate({ id: "a", state: "learning", intervalDays: 0 }).box, 1);
  eq(S.migrate({ id: "b", state: "review", intervalDays: 3 }).box, 2);
  eq(S.migrate({ id: "c", state: "review", intervalDays: 10 }).box, 3);
  eq(S.migrate({ id: "d", state: "review", intervalDays: 50 }).box, 4);
  eq(S.migrate({ id: "e", state: "review", intervalDays: 50 }).state, undefined);
});

// ---------- Inhalte ----------
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
    if (!/^[。、「」！？…―\s]+$/.test(t)) {
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

test("Geschichten aus einzelnen Dateien: Katalog vollständig geladen, eigene Wörter ergänzt", () => {
  eq(Content.stories.length, Content.catalog.length);
  eq(Content.story("momotaro").scenes.length, 5);
  eq(DICT["鬼"].r, "おに", "Wort aus dem dict-Abschnitt");
  eq(DICT["犬"].r, "いぬ", "Kana-Grundform übernommen"); eq(DICT["犬"].de, DICT["いぬ"].de);
  eq(Content.storyIdOf("momotaro/2/3"), "momotaro");
});

test("Jede Geschichte kommt mit dem gemeinsamen Wörterbuch und ihrem eigenen dict aus", () => {
  for (const story of Content.stories) {
    const allowed = new Set([...BASE_DICT_KEYS, ...story.dictKeys]);
    const check = (k, where) => { if (!allowed.has(k)) throw new Error(`${story.id}: „${k}“ fehlt (${where})`); };
    for (const s of story.flat) s.tokens.forEach((t, i) => {
      if (/^[。、「」！？…―\s]+$/.test(t)) return;
      check(t, s.id); check(s.vocabIds[i], `Grundform in ${s.id}`);
    });
    for (const k of story.dictKeys) if (DICT[k].base) check(DICT[k].base, `base von ${k}`);
  }
});

test("Abdeckung: nur gefestigte Wörter zählen (ohne Partikel und Namen), Rest nach Lernkartei/Merkliste", () => {
  const none = Content.coverage("neko", () => "unknown");
  eq(none.pct, 0);
  const all = Content.coverage("neko", () => "known");
  eq(all.pct, 100); eq(all.unknownWords, 0);
  const story = Content.story("neko");
  const learnable = Object.keys(story.freq).filter(Content.isLearnable);
  const [a, b, c] = learnable;
  const mixed = Content.coverage("neko", v => (v === a ? "known" : v === b ? "learning" : v === c ? "saved" : "unknown"));
  const total = learnable.reduce((n, v) => n + story.freq[v], 0);
  eq(mixed.pct, Math.round((story.freq[a] / total) * 100), "Lernkartei (Fach 1–3) und Merkliste zählen noch nicht als bekannt");
  eq(mixed.learning, 1); eq(mixed.saved, 1); eq(mixed.fresh, learnable.length - 3);
});
// ---------- Kanji (Heisig) ----------
test("Heisig-Reihenfolge stimmt mit der deutschen Ausgabe überein", () => {
  eq(Heisig.TOTAL, 2200);
  const expected = { 137: "水", 402: "歴", 540: "曽", 1934: "共", 2173: "関" }; // Wasser, Zeitablauf, zuvor, zusammen, Zusammenhang
  for (const [n, k] of Object.entries(expected)) eq(Heisig.frame(Number(n)).kanji, k, `Rahmen ${n}`);
  for (let n = 1; n <= 2200; n++) if (Heisig.frame(n).n !== n) throw new Error(`Lücke bei Rahmen ${n}`);
});

test("Heisig: Rahmen nur in Reihenfolge, Tageslimit, Fach 1 erst morgen abgefragt", () => {
  const T = at(17, 10);
  Heisig.learn(1, "eins", "", T);
  eq(Heisig.unlocked, 1); eq(Heisig.nextFrame(), 2); eq(Heisig.status(1), "box1");
  let threw = false;
  try { Heisig.learn(5, "x", "", T); } catch { threw = true; }
  eq(threw, true, "Sprung in der Reihenfolge");
  for (let n = 2; n <= 10; n++) Heisig.learn(n, "", "", T);
  eq(Heisig.newAllowance(T), 0, "Tageslimit 10");
  eq(Store.db.heisig.cards.length, 10);
  eq(Heisig.dueQueue(T).length, 0, "heute nichts fällig"); eq(Heisig.practiceCards(T).length, 10, "heute übbar");
  eq(Heisig.promptText(2), `(engl.) ${Heisig.frame(2).en.split(", ")[0]}`, "Ersatz ohne Schlüsselwort");
});

test("Heisig: „bis Rahmen X gelernt“ legt Karten in Fach 3, verteilt über zwei Wochen", () => {
  const T = at(17, 10);
  const added = Heisig.markLearnedUntil(40, T);
  eq(added, 30); eq(Heisig.unlocked, 40);
  const imported = Store.db.heisig.cards.filter(c => c.frame > 10);
  eq(new Set(imported.map(c => c.dueAt)).size, 14, "verschiedene Fälligkeitstage");
  eq(imported.every(c => c.box === 3), true, "Fach 3");
});

test("Heisig: offene Tagesabfrage sperrt neue Rahmen", () => {
  const T = at(19, 10); // zwei Tage später: Fach-1-Karten von gestern sind fällig
  eq(Heisig.gateOpen(T), false); eq(Heisig.newAllowance(T), 0);
  let threw = false;
  try { Heisig.learn(41, "", "", T); } catch { threw = true; }
  eq(threw, true);
});

test("Strichfolgen-Datei pro 200 Rahmen", () => {
  eq(KanjiStrokes.fileFor(1), "data/strokes/0001-0200.js");
  eq(KanjiStrokes.fileFor(200), "data/strokes/0001-0200.js");
  eq(KanjiStrokes.fileFor(201), "data/strokes/0201-0400.js");
  eq(KanjiStrokes.fileFor(2200), "data/strokes/2001-2200.js");
});

const failed = results.filter(r => !r.ok).length;
document.getElementById("summary").innerHTML = failed
  ? `<span class="fail">${failed} von ${results.length} Tests fehlgeschlagen</span>`
  : `<span class="ok">Alle ${results.length} Tests bestanden ✓</span>`;
document.getElementById("out").innerHTML = results.map(r =>
  `<div class="${r.ok ? "ok" : "fail"}">${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : ` – ${r.msg}`}</div>`).join("");
