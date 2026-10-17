"use strict";
// Kana-Übung (Extra im Profil): Tabelle und Quiz

const KanaPractice = (() => {
  const ALL_KANA = []; // { char, romaji, group, script }
  for (const g of KANA_GROUPS) for (const row of g.rows) for (const cell of row) {
    if (!cell) continue;
    ALL_KANA.push({ char: cell[0], romaji: cell[1], group: g.id, script: "hira" });
    ALL_KANA.push({ char: toKatakana(cell[0]), romaji: cell[1], group: g.id, script: "kata" });
  }
  // Alternative Schreibweisen, die beim Eintippen akzeptiert werden
  const ROMAJI_ALT = {
    shi: ["si"], chi: ["ti"], tsu: ["tu"], fu: ["hu"], ji: ["zi", "di"], zu: ["du"], wo: ["o"], n: ["nn"],
    sha: ["sya"], shu: ["syu"], sho: ["syo"], cha: ["tya", "cya"], chu: ["tyu", "cyu"], cho: ["tyo", "cyo"],
    ja: ["zya", "jya"], ju: ["zyu", "jyu"], jo: ["zyo", "jyo"],
  };
  const accepts = (answer, input) => input === answer || (ROMAJI_ALT[answer] || []).includes(input);

  const stat = ch => Store.db.kana[ch] || { c: 0, w: 0 };
  function level(ch) {
    const { c, w } = stat(ch);
    const n = c + w;
    if (n === 0) return 0;
    if (n < 3) return 1;
    const ratio = c / n;
    if (ratio >= 0.9 && c >= 5) return 4;
    if (ratio >= 0.75) return 3;
    if (ratio >= 0.5) return 2;
    return 1;
  }
  function record(ch, ok) {
    const s = stat(ch);
    ok ? s.c++ : s.w++;
    Store.db.kana[ch] = s;
    Store.touchDay();
    Store.persist();
  }

  const modeSeg = segmented($("#kana-mode"), "table", v => mode(v));
  function mode(m) {
    modeSeg.set(m);
    $("#kana-table-wrap").classList.toggle("hidden", m !== "table");
    $("#kana-quiz-wrap").classList.toggle("hidden", m !== "quiz");
    if (m === "table") renderTable();
  }

  // ---------- Tabelle ----------
  const tableScript = segmented($("#table-script"), "hira", () => renderTable());
  function renderTable() {
    const script = tableScript.get();
    $("#kana-table").innerHTML = KANA_GROUPS.map(g => {
      const cols = g.rows[0].length;
      const cells = g.rows.flat().map(cell => {
        if (!cell) return `<div class="kana-cell empty"></div>`;
        const ch = script === "kata" ? toKatakana(cell[0]) : cell[0];
        return `<button class="kana-cell lvl${level(ch)}" data-ch="${ch}" title="${cell[1]}">
          <span class="k">${ch}</span><span class="r">${cell[1]}</span></button>`;
      }).join("");
      return `<div class="kana-group"><h3>${g.name}</h3>
        <div class="kana-grid" style="grid-template-columns:repeat(${cols},1fr)">${cells}</div></div>`;
    }).join("");
  }
  $("#kana-table").addEventListener("click", e => {
    const cell = e.target.closest("[data-ch]");
    if (cell) Speech.say(cell.dataset.ch, 0.85);
  });

  // ---------- Quiz ----------
  $("#kq-groups").innerHTML = KANA_GROUPS.map((g, i) =>
    `<label><input type="checkbox" value="${g.id}" ${i === 0 ? "checked" : ""}> ${g.name}</label>`).join("");
  const kqScript = segmented($("#kq-script"), "hira");
  const kqMode = segmented($("#kq-mode"), "choice");
  const kqCount = segmented($("#kq-count"), "20");
  let kq = null;

  function start() {
    const groups = $$("#kq-groups input:checked").map(i => i.value);
    if (!groups.length) { toast("Bitte mindestens eine Zeichengruppe wählen."); return; }
    const script = kqScript.get();
    const pool = ALL_KANA.filter(k => groups.includes(k.group) && (script === "both" || k.script === script));
    const questions = [];
    let last = null;
    for (let i = 0; i < Number(kqCount.get()); i++) {
      const candidates = pool.length > 1 ? pool.filter(k => k !== last) : pool;
      // Schwache Zeichen kommen häufiger dran
      const q = weightedPick(candidates, k => { const s = stat(k.char); return 1 + s.w * 1.5 + (s.c + s.w === 0 ? 1 : 0) - Math.min(s.c, 6) * 0.1; });
      questions.push(q);
      last = q;
    }
    kq = { pool, questions, mode: kqMode.get(), i: 0, score: 0, missed: [], answered: false };
    $("#kq-setup").classList.add("hidden");
    $("#kq-result").classList.add("hidden");
    $("#kq-play").classList.remove("hidden");
    showQuestion();
  }
  $("#kq-start").addEventListener("click", start);

  function showQuestion() {
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
      const source = kq.pool.length >= 8 ? kq.pool : ALL_KANA.filter(k => k.script === q.script);
      const seen = new Set([q.romaji]);
      const distractors = [];
      for (const k of shuffle(source)) {
        if (seen.has(k.romaji)) continue;
        seen.add(k.romaji);
        distractors.push(k);
        if (distractors.length === 3) break;
      }
      $("#kq-choices").innerHTML = shuffle([q, ...distractors]).map((o, idx) =>
        `<button data-romaji="${o.romaji}"><kbd>${idx + 1}</kbd>${reverse ? o.char : o.romaji}</button>`).join("");
    }
  }

  $("#kq-choices").addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn || kq.answered) return;
    answer(btn.dataset.romaji === kq.questions[kq.i].romaji, btn);
  });
  $("#kq-form").addEventListener("submit", e => {
    e.preventDefault();
    if (kq.answered) { next(); return; }
    const val = $("#kq-input").value.trim().toLowerCase();
    if (val) answer(accepts(kq.questions[kq.i].romaji, val));
  });

  function answer(ok, btn) {
    const q = kq.questions[kq.i];
    kq.answered = true;
    record(q.char, ok);
    Speech.say(q.char, 0.85);
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

  $("#kq-next").addEventListener("click", next);
  function next() {
    kq.i++;
    if (kq.i < kq.questions.length) { showQuestion(); return; }
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
      <div class="row center">
        <button class="primary" id="kq-again">Nochmal</button>
        <button class="secondary" id="kq-settings">Einstellungen</button>
      </div>`;
    el.classList.remove("hidden");
    $("#kq-again").onclick = start;
    $("#kq-settings").onclick = () => { el.classList.add("hidden"); $("#kq-setup").classList.remove("hidden"); };
  }

  function onKey(e) {
    if (!kq || $("#kq-play").classList.contains("hidden") || $("#kana-quiz-wrap").classList.contains("hidden")) return;
    if (/^[1-4]$/.test(e.key) && !kq.answered && !$("#kq-choices").classList.contains("hidden")) {
      const btn = $$("#kq-choices button")[Number(e.key) - 1];
      if (btn) btn.click();
    } else if (e.key === "Enter" && kq.answered && document.activeElement !== $("#kq-next")) {
      next();
    }
  }

  const refresh = () => { if (!$("#kana-table-wrap").classList.contains("hidden")) renderTable(); };
  return { mode, onKey, refresh };
})();
