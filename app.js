"use strict";

// ---------- Hilfsfunktionen ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function weightedPick(items, weightFn) {
  const weights = items.map(weightFn);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ---------- Speicher ----------
const STORE_KEY = "binjeru-v1";
// custom: aus Geschichten übernommene Vokabeln, storiesDone: Indizes fertig gehörter Geschichten
const defaultState = () => ({ kana: {}, vocab: {}, days: [], answered: 0, correct: 0, custom: [], storiesDone: [], stPrefs: {} });
let state;
try {
  state = Object.assign(defaultState(), JSON.parse(localStorage.getItem(STORE_KEY)) || {});
} catch {
  state = defaultState();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* z. B. privater Modus */ }
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function recordAnswer(ok) {
  state.answered++;
  if (ok) state.correct++;
  const t = todayStr();
  if (!state.days.includes(t)) state.days.push(t);
  save();
}
function streak() {
  const days = new Set(state.days);
  const d = new Date();
  const fmt = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  if (!days.has(fmt(d))) d.setDate(d.getDate() - 1); // heute noch nicht geübt: Serie von gestern zählt
  let n = 0;
  while (days.has(fmt(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---------- Sprachausgabe ----------
let jaVoice = null;
function loadVoice() {
  if (!("speechSynthesis" in window)) return;
  jaVoice = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith("ja")) || null;
  updateVoiceHint();
}
if ("speechSynthesis" in window) {
  loadVoice();
  speechSynthesis.onvoiceschanged = loadVoice;
}
function makeUtterance(text, rate = 0.85) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  if (jaVoice) u.voice = jaVoice;
  u.rate = rate;
  return u;
}
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(makeUtterance(text));
}

// ---------- Kana ----------
const ALL_KANA = []; // { char, romaji, group, script }
for (const g of KANA_GROUPS) {
  for (const row of g.rows) {
    for (const cell of row) {
      if (!cell) continue;
      ALL_KANA.push({ char: cell[0], romaji: cell[1], group: g.id, script: "hira" });
      ALL_KANA.push({ char: toKatakana(cell[0]), romaji: cell[1], group: g.id, script: "kata" });
    }
  }
}

// Alternative Schreibweisen, die beim Eintippen akzeptiert werden
const ROMAJI_ALT = {
  shi: ["si"], chi: ["ti"], tsu: ["tu"], fu: ["hu"], ji: ["zi", "di"], zu: ["du"], wo: ["o"], n: ["nn"],
  sha: ["sya"], shu: ["syu"], sho: ["syo"], cha: ["tya", "cya"], chu: ["tyu", "cyu"], cho: ["tyo", "cyo"],
  ja: ["zya", "jya"], ju: ["zyu", "jyu"], jo: ["zyo", "jyo"],
};
const acceptsRomaji = (answer, input) => input === answer || (ROMAJI_ALT[answer] || []).includes(input);

function kanaStat(ch) { return state.kana[ch] || { c: 0, w: 0 }; }
function kanaLevel(ch) {
  const { c, w } = kanaStat(ch);
  const n = c + w;
  if (n === 0) return 0;
  const ratio = c / n;
  if (n < 3) return 1;
  if (ratio >= 0.9 && c >= 5) return 4;
  if (ratio >= 0.75) return 3;
  if (ratio >= 0.5) return 2;
  return 1;
}
function recordKana(ch, ok) {
  const s = kanaStat(ch);
  ok ? s.c++ : s.w++;
  state.kana[ch] = s;
  recordAnswer(ok);
}

// ---------- Navigation ----------
function showView(name) {
  $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  $$("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  if (name === "home") renderHome();
  if (name === "table") renderTable();
  if (name === "cards") nextCard();
  closeWordPop();
  if (name === "stories") { if (!st) renderStoryList(); }
  else pauseStory();
  window.scrollTo(0, 0);
}
$$("#tabs button").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
$$("[data-goto]").forEach(b => b.addEventListener("click", () => showView(b.dataset.goto)));

// Segment-Steuerelemente: gibt eine Funktion zurück, die den aktuellen Wert liefert
function segmented(id, onChange) {
  const el = $(`#${id}`);
  el.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    $$("button", el).forEach(b => b.classList.toggle("active", b === btn));
    onChange && onChange();
  });
  return () => {
    const b = $("button.active", el);
    return b.dataset.v || b.dataset.script;
  };
}

// ---------- Start ----------
function renderHome() {
  const learnedKana = ALL_KANA.filter(k => kanaLevel(k.char) >= 3).length;
  const learnedVocab = VOCAB.filter(v => (state.vocab[v.id] || 0) >= 3).length;
  const acc = state.answered ? Math.round((state.correct / state.answered) * 100) : 0;
  const s = streak();
  const tile = (value, label, pct) => `
    <div class="stat"><b>${value}</b><span>${label}</span>
    ${pct != null ? `<div class="mini"><div style="width:${pct}%"></div></div>` : ""}</div>`;
  $("#stats").innerHTML =
    tile(`${s} 🔥`, s === 1 ? "Tag in Folge" : "Tage in Folge") +
    tile(`${learnedKana}/${ALL_KANA.length}`, "Kana gelernt", (learnedKana / ALL_KANA.length) * 100) +
    tile(`${learnedVocab}/${VOCAB.length}`, "Vokabeln gelernt", (learnedVocab / VOCAB.length) * 100) +
    tile(`${acc}%`, `Trefferquote (${state.answered} Antworten)`);
}
$("#reset-progress").addEventListener("click", () => {
  if (!confirm("Wirklich den gesamten Lernfortschritt löschen?")) return;
  // Aus Geschichten übernommene Vokabeln bleiben erhalten, nur ihr Lernstand wird zurückgesetzt
  state = Object.assign(defaultState(), { custom: state.custom, stPrefs: state.stPrefs });
  save();
  renderHome();
});

// ---------- Kana-Tabelle ----------
const tableScript = segmented("table-script", renderTable);
function renderTable() {
  const script = tableScript();
  $("#kana-table").innerHTML = KANA_GROUPS.map(g => {
    const cols = g.rows[0].length;
    const cells = g.rows.flat().map(cell => {
      if (!cell) return `<div class="kana-cell empty"></div>`;
      const ch = script === "kata" ? toKatakana(cell[0]) : cell[0];
      return `<button class="kana-cell lvl${kanaLevel(ch)}" data-ch="${ch}" title="${cell[1]}">
        <span class="k">${ch}</span><span class="r">${cell[1]}</span></button>`;
    }).join("");
    return `<div class="kana-group"><h3>${g.name}</h3>
      <div class="kana-grid" style="grid-template-columns:repeat(${cols},1fr)">${cells}</div></div>`;
  }).join("");
}
$("#kana-table").addEventListener("click", e => {
  const cell = e.target.closest("[data-ch]");
  if (cell) speak(cell.dataset.ch);
});

// ---------- Kana-Quiz ----------
$("#kq-groups").innerHTML = KANA_GROUPS.map((g, i) =>
  `<label><input type="checkbox" value="${g.id}" ${i === 0 ? "checked" : ""}> ${g.name}</label>`).join("");
const kqScript = segmented("kq-script");
const kqMode = segmented("kq-mode");
const kqCount = segmented("kq-count");
let kq = null;

$("#kq-start").addEventListener("click", startKanaQuiz);
function startKanaQuiz() {
  const groups = $$("#kq-groups input:checked").map(i => i.value);
  if (!groups.length) { alert("Bitte mindestens eine Zeichengruppe wählen."); return; }
  const script = kqScript();
  const pool = ALL_KANA.filter(k => groups.includes(k.group) && (script === "both" || k.script === script));
  const count = Number(kqCount());
  // Schwache Zeichen kommen häufiger dran
  const questions = [];
  let last = null;
  for (let i = 0; i < count; i++) {
    const candidates = pool.length > 1 ? pool.filter(k => k !== last) : pool;
    const q = weightedPick(candidates, k => { const s = kanaStat(k.char); return 1 + s.w * 1.5 + (s.c + s.w === 0 ? 1 : 0) - Math.min(s.c, 6) * 0.1; });
    questions.push(q);
    last = q;
  }
  kq = { pool, questions, mode: kqMode(), i: 0, score: 0, missed: [], answered: false };
  $("#kq-setup").classList.add("hidden");
  $("#kq-result").classList.add("hidden");
  $("#kq-play").classList.remove("hidden");
  showKanaQuestion();
}

function showKanaQuestion() {
  const q = kq.questions[kq.i];
  kq.answered = false;
  $("#kq-bar").style.width = `${(kq.i / kq.questions.length) * 100}%`;
  $("#kq-pos").textContent = `Frage ${kq.i + 1} / ${kq.questions.length}`;
  $("#kq-score").textContent = `${kq.score} richtig`;
  $("#kq-feedback").textContent = "";
  $("#kq-feedback").className = "feedback";
  $("#kq-next").classList.add("hidden");

  const reverse = kq.mode === "reverse";
  const qEl = $("#kq-question");
  qEl.textContent = reverse ? q.romaji : q.char;
  qEl.classList.toggle("romaji", reverse);

  if (kq.mode === "type") {
    $("#kq-choices").classList.add("hidden");
    $("#kq-form").classList.remove("hidden");
    const input = $("#kq-input");
    input.value = "";
    input.disabled = false;
    input.focus();
  } else {
    $("#kq-form").classList.add("hidden");
    $("#kq-choices").classList.remove("hidden");
    // Ablenker mit anderer Lesung, möglichst aus derselben Schrift
    const source = kq.pool.length >= 8 ? kq.pool : ALL_KANA.filter(k => k.script === q.script);
    const seen = new Set([q.romaji]);
    const distractors = [];
    for (const k of shuffle(source)) {
      if (seen.has(k.romaji)) continue;
      seen.add(k.romaji);
      distractors.push(k);
      if (distractors.length === 3) break;
    }
    const options = shuffle([q, ...distractors]);
    $("#kq-choices").innerHTML = options.map((o, idx) =>
      `<button data-romaji="${o.romaji}"><kbd>${idx + 1}</kbd>${reverse ? o.char : o.romaji}</button>`).join("");
  }
}

$("#kq-choices").addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn || kq.answered) return;
  answerKana(btn.dataset.romaji === kq.questions[kq.i].romaji, btn);
});
$("#kq-form").addEventListener("submit", e => {
  e.preventDefault();
  if (kq.answered) { nextKana(); return; }
  const val = $("#kq-input").value.trim().toLowerCase();
  if (!val) return;
  answerKana(acceptsRomaji(kq.questions[kq.i].romaji, val));
});

function answerKana(ok, btn) {
  const q = kq.questions[kq.i];
  kq.answered = true;
  recordKana(q.char, ok);
  speak(q.char);
  if (ok) kq.score++;
  else if (!kq.missed.includes(q)) kq.missed.push(q);

  if (btn) {
    $$("#kq-choices button").forEach(b => {
      b.disabled = true;
      if (b.dataset.romaji === q.romaji) b.classList.add("correct");
    });
    if (!ok) btn.classList.add("wrong");
  } else {
    $("#kq-input").disabled = true;
  }
  const fb = $("#kq-feedback");
  fb.className = `feedback ${ok ? "good" : "bad"}`;
  fb.textContent = ok ? `Richtig! ${q.char} = ${q.romaji}` : `Leider falsch – ${q.char} = ${q.romaji}`;
  $("#kq-score").textContent = `${kq.score} richtig`;
  $("#kq-next").classList.remove("hidden");
  $("#kq-next").focus();
}

$("#kq-next").addEventListener("click", nextKana);
function nextKana() {
  kq.i++;
  if (kq.i >= kq.questions.length) showKanaResult();
  else showKanaQuestion();
}

function showKanaResult() {
  $("#kq-play").classList.add("hidden");
  const pct = Math.round((kq.score / kq.questions.length) * 100);
  const msg = pct === 100 ? "Perfekt! 完璧!" : pct >= 80 ? "Sehr gut! すごい!" : pct >= 50 ? "Gut gemacht – weiter so!" : "Übung macht den Meister. がんばって!";
  const el = $("#kq-result");
  el.innerHTML = `
    <h2>Ergebnis</h2>
    <div class="result-score">${kq.score} / ${kq.questions.length}</div>
    <p class="center">${msg}</p>
    ${kq.missed.length ? `<p class="hint">Zum Wiederholen:</p>
      <div class="result-list">${kq.missed.map(k => `<span>${k.char} ${k.romaji}</span>`).join("")}</div>` : ""}
    <div class="result-actions">
      <button class="primary" id="kq-again">Nochmal</button>
      <button class="secondary" id="kq-settings">Einstellungen</button>
    </div>`;
  el.classList.remove("hidden");
  $("#kq-again").onclick = startKanaQuiz;
  $("#kq-settings").onclick = () => { el.classList.add("hidden"); $("#kq-setup").classList.remove("hidden"); };
}

// ---------- Kategorien ----------
const STORY_CAT = "Aus Geschichten";
const addToVocab = e => VOCAB.push({ id: `s-${e.kana}`, kana: e.kana, kanji: e.kanji, romaji: e.romaji, de: e.de, cat: STORY_CAT });
state.custom.forEach(addToVocab);
const deckHas = kana => VOCAB.some(v => v.kana === kana);

function renderCategoryOptions() {
  const cats = [...new Set(VOCAB.map(v => v.cat))];
  const html = `<option value="">Alle Kategorien</option>` +
    cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  for (const sel of [$("#fc-cat"), $("#vq-cat")]) {
    const prev = sel.value;
    sel.innerHTML = html;
    sel.value = cats.includes(prev) ? prev : "";
  }
}
renderCategoryOptions();
const vocabIn = cat => VOCAB.filter(v => !cat || v.cat === cat);
const jpMain = v => v.kanji || v.kana;

// ---------- Karteikarten (Leitner-System, Boxen 0–5) ----------
const fcDir = segmented("fc-dir", () => nextCard());
$("#fc-cat").addEventListener("change", () => nextCard());
let card = null;

function renderBoxes(list) {
  const counts = [0, 0, 0, 0, 0, 0];
  list.forEach(v => counts[state.vocab[v.id] || 0]++);
  const names = ["Neu", "Box 1", "Box 2", "Box 3", "Box 4", "Gemeistert"];
  $("#fc-boxes").innerHTML = counts.map((n, i) => `<div class="box">${names[i]}: <b>${n}</b></div>`).join("");
}

function nextCard() {
  const list = vocabIn($("#fc-cat").value);
  renderBoxes(list);
  const candidates = list.length > 1 && card ? list.filter(v => v.id !== card.id) : list;
  card = weightedPick(candidates, v => 2 ** (5 - (state.vocab[v.id] || 0)));
  const jp = `
    <span class="jp">${jpMain(card)}</span>
    ${card.kanji ? `<span class="kana">${card.kana}</span>` : ""}
    <span class="romaji">${card.romaji}</span>`;
  const de = `<span class="de">${escapeHtml(card.de)}</span>`;
  const tag = `<span class="tag">${card.cat}</span>`;
  const showJp = fcDir() === "jp";
  $("#fc-front").innerHTML = tag + (showJp ? jp : de);
  $("#fc-back").innerHTML = tag + (showJp ? de : jp);
  $("#flashcard").classList.remove("flipped");
  if (showJp) speak(card.kana);
}

function flipCard() {
  const fc = $("#flashcard");
  fc.classList.toggle("flipped");
  if (fc.classList.contains("flipped") && fcDir() === "de") speak(card.kana);
}
function rateCard(ok) {
  const box = state.vocab[card.id] || 0;
  state.vocab[card.id] = ok ? Math.min(box + 1, 5) : 1;
  recordAnswer(ok);
  nextCard();
}
$("#flashcard").addEventListener("click", flipCard);
$("#fc-right").addEventListener("click", () => rateCard(true));
$("#fc-wrong").addEventListener("click", () => rateCard(false));
$("#fc-speak").addEventListener("click", () => speak(card.kana));

// ---------- Vokabel-Quiz ----------
const vqDir = segmented("vq-dir");
let vq = null;
$("#vq-start").addEventListener("click", startVocabQuiz);

function startVocabQuiz() {
  const pool = vocabIn($("#vq-cat").value);
  vq = { pool, questions: shuffle(pool).slice(0, 10), dir: vqDir(), i: 0, score: 0, missed: [], answered: false };
  $("#vq-setup").classList.add("hidden");
  $("#vq-result").classList.add("hidden");
  $("#vq-play").classList.remove("hidden");
  showVocabQuestion();
}

function showVocabQuestion() {
  const q = vq.questions[vq.i];
  vq.answered = false;
  $("#vq-bar").style.width = `${(vq.i / vq.questions.length) * 100}%`;
  $("#vq-pos").textContent = `Frage ${vq.i + 1} / ${vq.questions.length}`;
  $("#vq-score").textContent = `${vq.score} richtig`;
  $("#vq-feedback").textContent = "";
  $("#vq-feedback").className = "feedback";
  $("#vq-next").classList.add("hidden");

  const toDe = vq.dir === "jp";
  $("#vq-question").innerHTML = toDe
    ? `<span class="main">${jpMain(q)}</span><span class="sub">${q.kanji ? q.kana + " · " : ""}${q.romaji}</span>`
    : `<span class="de">${escapeHtml(q.de)}</span>`;
  if (toDe) speak(q.kana);

  const source = vq.pool.length >= 4 ? vq.pool : VOCAB;
  const distractors = shuffle(source.filter(v => v.id !== q.id && v.de !== q.de)).slice(0, 3);
  $("#vq-choices").innerHTML = shuffle([q, ...distractors]).map((o, idx) =>
    `<button data-id="${o.id}"><kbd>${idx + 1}</kbd>${toDe ? escapeHtml(o.de) : `${jpMain(o)}${o.kanji ? ` <small>(${o.kana})</small>` : ""}`}</button>`).join("");
}

$("#vq-choices").addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn || vq.answered) return;
  const q = vq.questions[vq.i];
  const ok = btn.dataset.id === String(q.id);
  vq.answered = true;
  recordAnswer(ok);
  if (ok) vq.score++;
  else vq.missed.push(q);
  $$("#vq-choices button").forEach(b => {
    b.disabled = true;
    if (b.dataset.id === String(q.id)) b.classList.add("correct");
  });
  if (!ok) btn.classList.add("wrong");
  if (vq.dir === "de") speak(q.kana);
  const fb = $("#vq-feedback");
  fb.className = `feedback ${ok ? "good" : "bad"}`;
  fb.textContent = `${ok ? "Richtig!" : "Leider falsch –"} ${jpMain(q)} (${q.romaji}) = ${q.de}`;
  $("#vq-score").textContent = `${vq.score} richtig`;
  $("#vq-next").classList.remove("hidden");
  $("#vq-next").focus();
});

$("#vq-next").addEventListener("click", () => {
  vq.i++;
  if (vq.i < vq.questions.length) { showVocabQuestion(); return; }
  $("#vq-play").classList.add("hidden");
  const el = $("#vq-result");
  el.innerHTML = `
    <h2>Ergebnis</h2>
    <div class="result-score">${vq.score} / ${vq.questions.length}</div>
    ${vq.missed.length ? `<p class="hint">Zum Wiederholen:</p>
      <div class="result-list">${vq.missed.map(v => `<span>${jpMain(v)} – ${escapeHtml(v.de)}</span>`).join("")}</div>` : `<p class="center">Alles richtig! 完璧!</p>`}
    <div class="result-actions">
      <button class="primary" id="vq-again">Nochmal</button>
      <button class="secondary" id="vq-settings">Einstellungen</button>
    </div>`;
  el.classList.remove("hidden");
  $("#vq-again").onclick = startVocabQuiz;
  $("#vq-settings").onclick = () => { el.classList.add("hidden"); $("#vq-setup").classList.remove("hidden"); };
});

// ---------- Geschichten ----------
const isKanji = s => /[一-龯]/.test(s);
const PUNCT_ROMAJI = { "。": ".", "、": ",", "！": "!", "？": "?" };
const stPrefs = Object.assign({ furi: true, romaji: false, de: false, speed: "0.85" }, state.stPrefs);
let st = null; // { i, story, sentences, idx, playing, ended, run, utter }

function saveStPrefs() { state.stPrefs = stPrefs; save(); }

function updateVoiceHint() {
  const el = document.getElementById("st-voice-hint");
  if (!el) return;
  let msg = "";
  if (!("speechSynthesis" in window)) msg = "Dein Browser unterstützt keine Sprachausgabe – du kannst die Geschichten aber trotzdem lesen.";
  else if (!jaVoice) msg = "Keine japanische Stimme gefunden. Unter Windows: Einstellungen → Zeit und Sprache → Sprache → Japanisch hinzufügen (mit Sprachausgabe). In Edge und Chrome sind meist schon Stimmen dabei.";
  el.textContent = msg;
  el.classList.toggle("hidden", !msg);
}

// Eintrag, der beim Import in die Karteikarten landet (bei gebeugten Formen die Grundform)
function cardEntry(key) {
  const baseKey = DICT[key].base || key;
  const b = DICT[baseKey];
  return { kana: b.r, kanji: b.k || (isKanji(baseKey) ? baseKey : ""), romaji: b.ro, de: b.de };
}

function parseSentence(s) {
  const tokens = s.jp.split("|");
  let pos = 0;
  const offsets = tokens.map(t => { const o = pos; pos += t.length; return o; });
  return { tokens, offsets, text: tokens.join(""), de: s.de };
}

function romajiLine(tokens) {
  const line = tokens.map(t => DICT[t] ? DICT[t].ro : PUNCT_ROMAJI[t] || t).join(" ").replace(/ ([.,!?])/g, "$1");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

function tokenHtml(t, si, ti) {
  const w = DICT[t];
  if (!w) return `<span class="st-punct">${escapeHtml(t)}</span>`;
  const inner = isKanji(t) ? `<ruby>${t}<rt>${w.r}</rt></ruby>` : t;
  return `<span class="tok" tabindex="0" data-k="${t}" data-si="${si}" data-ti="${ti}">${inner}</span>`;
}

function renderStoryList() {
  pauseStory();
  st = null;
  $("#st-reader").classList.add("hidden");
  $("#st-list").classList.remove("hidden");
  $("#st-list").innerHTML = STORIES.map((s, i) => `
    <button class="feature story-card" data-story="${i}">
      <span class="f-icon">${s.icon}</span>
      <b><span class="jp-title">${s.title}</span> <small>${escapeHtml(s.titleDe)}</small></b>
      <span>${s.level} · ${s.sentences.length} Sätze${state.storiesDone.includes(i) ? " · ✓ gehört" : ""}</span>
    </button>`).join("");
}
$("#st-list").addEventListener("click", e => {
  const card = e.target.closest("[data-story]");
  if (card) openStory(Number(card.dataset.story));
});
$("#st-back").addEventListener("click", () => { closeWordPop(); renderStoryList(); window.scrollTo(0, 0); });

function openStory(i) {
  const story = STORIES[i];
  st = { i, story, sentences: story.sentences.map(parseSentence), idx: 0, playing: false, ended: false, run: 0, utter: null };
  $("#st-list").classList.add("hidden");
  $("#st-reader").classList.remove("hidden");
  $("#st-title").innerHTML = `<span class="jp-title">${story.title}</span> <small>${escapeHtml(story.titleDe)}</small>`;
  $("#st-text").innerHTML = st.sentences.map((s, si) => `
    <li class="st-sent" data-si="${si}">
      <button class="st-say" data-si="${si}" title="Nur diesen Satz anhören" aria-label="Satz ${si + 1} anhören">▶</button>
      <div class="st-body">
        <p class="st-jp">${s.tokens.map((t, ti) => tokenHtml(t, si, ti)).join("")}</p>
        <p class="st-ro">${escapeHtml(romajiLine(s.tokens))}</p>
        <p class="st-de">${escapeHtml(s.de)}</p>
      </div>
    </li>`).join("");
  applyStPrefs();
  markDeckWords();
  setCurrent(0);
  updatePlayBtn();
  updateVoiceHint();
  window.scrollTo(0, 0);
}

function markDeckWords() {
  $$("#st-text .tok").forEach(t => t.classList.toggle("in-deck", deckHas(cardEntry(t.dataset.k).kana)));
}

// Anzeige-Optionen
function applyStPrefs() {
  const text = $("#st-text");
  text.classList.toggle("no-furi", !stPrefs.furi);
  text.classList.toggle("show-ro", stPrefs.romaji);
  text.classList.toggle("show-de", stPrefs.de);
}
const stToggles = { "st-furi": "furi", "st-romaji": "romaji", "st-de": "de" };
for (const [id, key] of Object.entries(stToggles)) {
  const box = $(`#${id}`);
  box.checked = stPrefs[key];
  box.addEventListener("change", () => { stPrefs[key] = box.checked; saveStPrefs(); applyStPrefs(); });
}
$$("#st-speed button").forEach(b => b.classList.toggle("active", b.dataset.v === stPrefs.speed));
const stSpeed = segmented("st-speed", () => { stPrefs.speed = stSpeed(); saveStPrefs(); });

// Wiedergabe: Satz für Satz, damit Pause/Weiter zuverlässig funktioniert
function setCurrent(i) {
  st.idx = i;
  $$("#st-text .st-sent").forEach((li, n) => li.classList.toggle("current", n === i));
}
function highlightToken(si, charIndex) {
  $$("#st-text .tok.speaking").forEach(t => t.classList.remove("speaking"));
  if (si < 0) return;
  const { offsets } = st.sentences[si];
  let ti = 0;
  while (ti + 1 < offsets.length && offsets[ti + 1] <= charIndex) ti++;
  const tok = $(`#st-text .tok[data-si="${si}"][data-ti="${ti}"]`);
  if (tok) tok.classList.add("speaking");
}
function updatePlayBtn() {
  const btn = $("#st-play");
  const playing = st && st.playing;
  btn.textContent = playing ? "⏸" : "▶";
  btn.setAttribute("aria-label", playing ? "Pause" : "Abspielen");
}

function playSentence(i, continueAfter) {
  if (!("speechSynthesis" in window)) return;
  const run = ++st.run;
  speechSynthesis.cancel();
  st.playing = true;
  st.ended = false;
  setCurrent(i);
  updatePlayBtn();
  $(`#st-text .st-sent[data-si="${i}"]`).scrollIntoView({ block: "nearest", behavior: "smooth" });
  const u = makeUtterance(st.sentences[i].text, Number(stPrefs.speed));
  u.onboundary = e => { if (run === st.run) highlightToken(i, e.charIndex); };
  u.onend = () => {
    if (!st || run !== st.run) return;
    highlightToken(-1);
    if (continueAfter && i + 1 < st.sentences.length) {
      setTimeout(() => { if (st && run === st.run && st.playing) playSentence(i + 1, true); }, 450);
      return;
    }
    if (continueAfter) {
      st.ended = true;
      if (!state.storiesDone.includes(st.i)) { state.storiesDone.push(st.i); save(); }
    }
    st.playing = false;
    updatePlayBtn();
  };
  st.utter = u; // Referenz halten, sonst feuert onend in Chrome manchmal nicht
  speechSynthesis.speak(u);
}
function pauseStory() {
  if (!st) return;
  st.run++;
  st.playing = false;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  highlightToken(-1);
  updatePlayBtn();
}
function togglePlay() {
  if (st.playing) pauseStory();
  else playSentence(st.ended ? 0 : st.idx, true);
}
function stepSentence(d) {
  const i = Math.max(0, Math.min(st.sentences.length - 1, st.idx + d));
  st.ended = false;
  if (st.playing) playSentence(i, true);
  else setCurrent(i);
}
$("#st-play").addEventListener("click", togglePlay);
$("#st-prev").addEventListener("click", () => stepSentence(-1));
$("#st-next").addEventListener("click", () => stepSentence(1));
$("#st-stop").addEventListener("click", () => { pauseStory(); st.ended = false; setCurrent(0); });

$("#st-text").addEventListener("click", e => {
  const say = e.target.closest(".st-say");
  if (say) { closeWordPop(); playSentence(Number(say.dataset.si), false); return; }
  const tok = e.target.closest(".tok");
  if (tok) { e.stopPropagation(); openWordPop(tok); }
});

// Wort-Popup
const pop = $("#word-pop");
let popKey = null;
function openWordPop(tok) {
  if (st.playing) pauseStory();
  const key = tok.dataset.k;
  const w = DICT[key];
  popKey = key;
  $$("#st-text .tok.selected").forEach(t => t.classList.remove("selected"));
  tok.classList.add("selected");
  const base = w.base ? DICT[w.base] : null;
  const baseLabel = base ? (base.k ? `${base.k}（${base.r}）` : base.r) : "";
  pop.innerHTML = `
    <button class="pop-close" data-act="close" aria-label="Schließen">×</button>
    ${w.tag ? `<div class="pop-tag">${w.tag}</div>` : ""}
    <div class="pop-word">${key}</div>
    ${w.r !== key ? `<div class="pop-kana">${w.r}</div>` : ""}
    <div class="pop-ro">${w.ro}</div>
    <div class="pop-de">${escapeHtml(w.de)}</div>
    ${base ? `<div class="pop-base">Grundform: <b>${baseLabel}</b> ${base.ro} – ${escapeHtml(base.de)}</div>` : ""}
    <div class="pop-actions">
      <button class="secondary" data-act="say">🔊 Anhören</button>
      <button class="primary" data-act="add"></button>
    </div>`;
  updateAddBtn();
  pop.classList.remove("hidden");
  // Unter dem Wort platzieren, notfalls darüber; innerhalb des Fensters halten
  const r = tok.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const left = Math.max(12, Math.min(r.left + r.width / 2 - pw / 2, document.documentElement.clientWidth - pw - 12));
  let top = r.bottom + 8;
  if (top + ph > innerHeight - 12 && r.top - ph - 8 > 12) top = r.top - ph - 8;
  pop.style.left = `${left + scrollX}px`;
  pop.style.top = `${top + scrollY}px`;
  speak(w.say || w.r);
}
function updateAddBtn() {
  const entry = cardEntry(popKey);
  const inDeck = deckHas(entry.kana);
  const btn = $('[data-act="add"]', pop);
  btn.disabled = inDeck;
  btn.textContent = inDeck ? "✓ In Karteikarten" : `+ Karteikarte${DICT[popKey].base ? " (Grundform)" : ""}`;
}
function closeWordPop() {
  pop.classList.add("hidden");
  popKey = null;
  $$("#st-text .tok.selected").forEach(t => t.classList.remove("selected"));
}
pop.addEventListener("click", e => {
  const act = e.target.closest("[data-act]");
  if (!act || !popKey) return;
  const w = DICT[popKey];
  if (act.dataset.act === "close") closeWordPop();
  else if (act.dataset.act === "say") speak(w.say || w.r);
  else if (act.dataset.act === "add") {
    const entry = cardEntry(popKey);
    if (deckHas(entry.kana)) return;
    state.custom.push(entry);
    save();
    addToVocab(entry);
    renderCategoryOptions();
    markDeckWords();
    updateAddBtn();
    toast(`„${entry.kanji || entry.kana}“ zu den Karteikarten hinzugefügt`);
  }
});
document.addEventListener("click", e => {
  if (!pop.classList.contains("hidden") && !pop.contains(e.target) && !e.target.closest(".tok")) closeWordPop();
});

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// ---------- Tastatur ----------
document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.ctrlKey || e.metaKey || e.altKey) return;
  const active = $(".view.active").id;

  if (active === "view-stories") {
    if (e.key === "Escape") { closeWordPop(); return; }
    if (!st) return;
    if (e.target.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
    if (e.key === " ") { e.preventDefault(); togglePlay(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); stepSentence(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); stepSentence(-1); }
    else if (e.key === "Enter" && e.target.classList.contains("tok")) openWordPop(e.target);
    return;
  }

  if (active === "view-cards") {
    if (e.key === " ") { e.preventDefault(); flipCard(); }
    else if (e.key === "1") rateCard(false);
    else if (e.key === "2") rateCard(true);
    return;
  }

  const quizMap = { "view-kanaquiz": ["#kq-play", "#kq-choices", "#kq-next", () => kq], "view-vocabquiz": ["#vq-play", "#vq-choices", "#vq-next", () => vq] };
  const cfg = quizMap[active];
  if (!cfg || $(cfg[0]).classList.contains("hidden")) return;
  const quiz = cfg[3]();
  if (!quiz) return;
  if (/^[1-4]$/.test(e.key) && !quiz.answered) {
    const btn = $$(`${cfg[1]} button`)[Number(e.key) - 1];
    if (btn && !$(cfg[1]).classList.contains("hidden")) btn.click();
  } else if (e.key === "Enter" && quiz.answered && document.activeElement !== $(cfg[2])) {
    $(cfg[2]).click();
  }
});

// ---------- Init ----------
renderHome();
