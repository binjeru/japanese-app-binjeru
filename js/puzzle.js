"use strict";
// Satzpuzzle: Sätze aus den Geschichten, deren Wörter alle schon in der Lernkartei liegen oder bekannt sind,
// werden in Bausteine (Wort + Partikel) zerlegt und gemischt; man setzt sie wieder in die richtige Reihenfolge.
// Geprüft wird gegen den Originalsatz. In Sätzen ohne Komma dürfen Satzglieder mit Partikel (山へ, 木を, …)
// auch anders stehen, solange das Prädikat am Ende bleibt – dann zeigt die App zusätzlich das Original.
// Statistik in db.puzzle: { total, perfect, seen: { sentenceId: n } }.

const Puzzle = (() => {
  const ROUND = 10, MIN_CHUNKS = 3, MAX_CHUNKS = 8;
  // Diese Wortarten hängen am vorigen Wort (山|へ → 山へ, 元気|な → 元気な, さむかった|です)
  const GLUE = new Set(["Partikel", "Satzendpartikel", "Kopula", "Suffix", "Hilfsverb"]);
  // Hilfsverben nach der て-Form (流れて|きました → 流れてきました)
  const TE_AUX = new Set(["いる", "くる", "いく", "しまう", "みる", "おく", "ある", "くれる", "あげる", "もらう"]);
  const END = /^[。！？…]+$/;
  const PUNCT = /^[。、「」！？…―\s]+$/;
  // Satzglieder, die ihre Position wechseln dürfen: Nomen + Kasuspartikel
  const FREE_END = /(は|が|を|に|へ|で|も|から|まで|より)$/;
  const NOUNISH = new Set(["Nomen", "Pronomen", "Name", "Zahlwort", "Fragewort", "Demonstrativ"]);

  let P = null; // Sitzung: { queue, idx, cur, pool, answer, state, tried, perfect, done }

  const stats = () => (Store.db.puzzle = Object.assign({ total: 0, perfect: 0, seen: {} }, Store.db.puzzle));
  const posOf = vid => (DICT[vid] && DICT[vid].pos) || "";

  // Satz in Bausteine zerlegen; null, wenn er sich nicht eignet (Zitate, mehrere Sätze, zu kurz/lang)
  function chunk(s) {
    if (s.tokens.some(t => t === "「" || t === "」")) return null;
    const chunks = [];
    let end = "", comma = false;
    for (const [ti, t] of s.tokens.entries()) {
      if (PUNCT.test(t)) {
        if (t === "、") { comma = true; continue; }
        if (END.test(t) && s.tokens.slice(ti + 1).every(x => PUNCT.test(x))) { end += t; continue; }
        if (END.test(t)) return null;   // mehrere Sätze
        continue;
      }
      if (!DICT[t]) return null;
      const vid = s.vocabIds[ti], prev = chunks[chunks.length - 1];
      const prevTok = ti > 0 ? s.tokens[ti - 1] : "";
      const glue = prev && (GLUE.has(posOf(vid)) || (TE_AUX.has(vid) && /[てで]$/.test(prevTok)));
      if (glue) prev.ti.push(ti);
      else chunks.push({ ti: [ti] });
    }
    if (chunks.length < MIN_CHUNKS || chunks.length > MAX_CHUNKS) return null;
    for (const c of chunks) c.text = c.ti.map(i => s.tokens[i]).join("");
    // Gleiche Bausteine (z. B. zweimal „と“-Glied) sind austauschbar: verglichen wird über den Text
    return { s, chunks, end, comma };
  }

  // Alle Wörter des Satzes sitzen schon in der Lernkartei (ab Fach 1) oder sind als bekannt markiert
  function eligible(s) {
    let words = 0;
    for (const [ti, t] of s.tokens.entries()) {
      if (PUNCT.test(t)) continue;
      const vid = s.vocabIds[ti];
      if (!DICT[vid]) return false;
      if (!Content.isLearnable(vid)) continue;
      words++;
      const st = Store.status(vid);
      if (st !== "active" && st !== "known") return false;
    }
    return words >= 2;
  }

  function candidates() {
    const out = [];
    for (const story of Content.stories)
      for (const s of story.flat) {
        if (!eligible(s)) continue;
        const c = chunk(s);
        if (c) out.push(c);
      }
    return out;
  }

  // Satzglieder für die freie Reihenfolge: Bausteine ohne Kasuspartikel hängen am nächsten (大きな → もも が)
  function phrases(cur) {
    const out = [];
    let acc = [];
    cur.chunks.forEach((c, i) => {
      acc.push(c.text);
      const head = cur.s.vocabIds[c.ti[0]];
      const free = FREE_END.test(c.text) && NOUNISH.has(posOf(head));
      if (free || i === cur.chunks.length - 1) { out.push(acc); acc = []; }
    });
    return out;
  }

  // Lässt sich die Antwort aus denselben Satzgliedern zusammensetzen, Prädikat am Ende?
  function altOk(cur, answer) {
    if (cur.comma) return false;
    const ph = phrases(cur), last = ph.length - 1, used = new Array(ph.length).fill(false);
    const fits = (p, i) => ph[i].every((t, k) => answer[p + k] === t);
    const go = p => {
      if (p === answer.length) return used.every(Boolean);
      for (let i = 0; i < ph.length; i++) {
        if (used[i] || !fits(p, i)) continue;
        if (i === last && p + ph[i].length !== answer.length) continue;
        used[i] = true;
        if (go(p + ph[i].length)) return true;
        used[i] = false;
      }
      return false;
    };
    return go(0);
  }

  // ---------- Sitzung ----------
  function start() {
    const all = candidates();
    if (!all.length) { toast("Noch keine passenden Sätze – lern zuerst ein paar Wörter mehr."); render(); return; }
    const seen = stats().seen;
    // Sätze mit Wörtern aus Fach 1–3 bevorzugen, selten gelöste zuerst, sonst zufällig
    const learningIn = c => c.s.vocabIds.some(v => DICT[v] && Content.isLearnable(v) && Store.mastery(v) === "learning");
    const score = c => Math.random() + (learningIn(c) ? 0.8 : 0) - Math.min(3, seen[c.s.id] || 0) * 0.4;
    const queue = all.map(c => [score(c), c]).sort((a, b) => b[0] - a[0]).slice(0, ROUND).map(x => x[1]);
    P = { queue, idx: 0, perfect: 0, done: 0 };
    load();
  }

  function load() {
    const cur = P.queue[P.idx];
    const order = cur.chunks.map((_, i) => i);
    let pool = shuffle(order);
    for (let n = 0; n < 5 && pool.every((v, i) => cur.chunks[v].text === cur.chunks[i].text); n++) pool = shuffle(order);
    Object.assign(P, { cur, pool, answer: [], state: "build", tried: false, wrongAt: [] });
    render();
  }

  function check() {
    const cur = P.cur, answer = P.answer.map(i => cur.chunks[i].text);
    const right = answer.every((t, i) => t === cur.chunks[i].text);
    if (right || altOk(cur, answer)) return finish(right ? "right" : "alt");
    P.tried = true;
    P.wrongAt = answer.map((t, i) => t !== cur.chunks[i].text);
    P.state = "wrong";
    render();
  }

  function finish(state) {
    const st = stats();
    const perfect = state !== "shown" && !P.tried;
    st.total++;
    if (perfect) { st.perfect++; P.perfect++; }
    st.seen[P.cur.s.id] = (st.seen[P.cur.s.id] || 0) + 1;
    Store.touchDay();
    Store.persist();
    P.done++;
    P.state = state;
    render();
    Player.playSentence(P.cur.s.id);
  }

  function next() {
    P.idx++;
    if (P.idx >= P.queue.length) { P.state = "end"; render(); return; }
    load();
  }

  // ---------- Darstellung ----------
  const chipHtml = (cur, i) => {
    const c = cur.chunks[i];
    return Content.sentenceHtml({ id: cur.s.id, storyId: cur.s.storyId, tokens: c.ti.map(t => cur.s.tokens[t]), vocabIds: c.ti.map(t => cur.s.vocabIds[t]) }, { furigana: true });
  };

  function render() {
    const root = $("#puzzle");
    if (!root) return;
    if (Content.stories.length < Content.catalog.length) {
      root.innerHTML = `<div class="panel center"><p class="hint">Geschichten werden geladen …</p></div>`;
      Content.loadAll().then(() => { if (currentView === "puzzle") render(); });
      return;
    }
    if (!P) return renderIntro(root);
    if (P.state === "end") return renderEnd(root);
    const cur = P.cur, solved = ["right", "alt", "shown"].includes(P.state);
    const verdict = {
      right: `<p class="pz-verdict good">✓ Richtig!</p>`,
      alt: `<p class="pz-verdict good">✓ Geht auch. Im Original steht es so:</p>`,
      wrong: `<p class="pz-verdict bad">Noch nicht ganz. Die rot markierten Bausteine stehen anders.</p>`,
      shown: `<p class="pz-verdict">So lautet der Satz:</p>`,
    }[P.state] || "";
    root.innerHTML = `
      <div class="session-top"><span class="hint on-page"><b>Satzpuzzle</b> · ${P.idx + 1} von ${P.queue.length}</span><button class="link on-page" data-pz="quit">Beenden</button></div>
      <div class="panel pz">
        ${solved ? "" : `
        <div class="pz-line">${P.answer.length
          ? P.answer.map((ci, k) => `<button class="pz-chip ${P.state === "wrong" && P.wrongAt[k] ? "wrong" : ""}" data-a="${k}">${chipHtml(cur, ci)}</button>`).join("") + `<span class="pz-end">${escapeHtml(cur.end)}</span>`
          : `<span class="hint">Tippe die Bausteine in der richtigen Reihenfolge an.</span>`}</div>`}
        ${verdict}
        ${solved ? `
          <p class="jp pz-sentence">${Content.sentenceHtml(cur.s, { furigana: true, statusOf: Store.status, tabbable: true })}</p>
          <details class="fold"><summary>Übersetzung</summary><p class="de">${escapeHtml(cur.s.de)}</p></details>
          <div class="row center">
            <button class="secondary" data-pz="listen">▶ Satz</button>
            <button class="primary" data-pz="next">${P.idx + 1 < P.queue.length ? "Weiter" : "Fertig"} <kbd>⏎</kbd></button>
          </div>` : `
          <div class="pz-pool">${P.pool.map((ci, k) => `<button class="pz-chip" data-p="${k}">${chipHtml(cur, ci)}</button>`).join("")}</div>
          <div class="row center">
            <button class="secondary" data-pz="listen">▶ Anhören</button>
            ${P.answer.length ? `<button class="secondary" data-pz="reset">Zurücksetzen</button>` : ""}
            <button class="secondary" data-pz="show">Lösung zeigen</button>
          </div>
          <details class="fold"><summary>Übersetzung</summary><p class="de">${escapeHtml(cur.s.de)}</p></details>
          <div class="row center rate-row">
            <button class="primary big" data-pz="check" ${P.pool.length ? "disabled" : ""}>Prüfen <kbd>⏎</kbd></button>
          </div>`}
      </div>`;
  }

  function renderIntro(root) {
    const n = candidates().length, st = stats();
    root.innerHTML = `
      <div class="toolbar"><button class="secondary" data-goto="games">← Spiele</button></div>
      <div class="panel center">
        <h2>🧩 Satzpuzzle</h2>
        <p>Sätze aus deinen Geschichten, zerlegt in Bausteine. Setz sie wieder in die richtige Reihenfolge.</p>
        <p class="hint">Es kommen nur Sätze, deren Wörter alle schon in deiner Lernkartei liegen oder bekannt sind.
          Mit jedem neuen Wort werden es mehr.</p>
        <p><b>${n}</b> ${n === 1 ? "passender Satz" : "passende Sätze"}${st.total ? ` · bisher ${st.total} gelöst, ${st.perfect} davon auf Anhieb` : ""}</p>
        ${n ? `<button class="primary big" data-pz="start">Puzzle starten · ${Math.min(ROUND, n)} ${Math.min(ROUND, n) === 1 ? "Satz" : "Sätze"}</button>` : `<p class="hint">Noch kein Satz passt. Aktiviere zuerst ein paar Wörter aus der Merkliste.</p>`}
      </div>`;
  }

  function renderEnd(root) {
    root.innerHTML = `
      <div class="panel center">
        <h2>お疲れさま！ <small>Satzpuzzle</small></h2>
        <p><b>${P.done}</b> ${P.done === 1 ? "Satz" : "Sätze"} gebaut · ${P.perfect} auf Anhieb richtig</p>
        <div class="row center">
          <button class="secondary" data-pz="start">Nochmal</button>
          <button class="primary" data-pz="quit">Fertig</button>
        </div>
      </div>`;
  }

  function onClick(e) {
    const tok = e.target.closest(".pz-sentence .tok[data-k]");
    if (tok) { WordSheet.open(tok.dataset.k, tok.dataset.sid); return; }
    const p = e.target.closest("[data-p]"), a = e.target.closest("[data-a]");
    if (p && P) {
      if (P.state === "wrong") { P.state = "build"; P.wrongAt = []; }
      P.answer.push(P.pool.splice(Number(p.dataset.p), 1)[0]);
      render();
      return;
    }
    if (a && P) {
      if (P.state === "wrong") { P.state = "build"; P.wrongAt = []; }
      P.pool.push(P.answer.splice(Number(a.dataset.a), 1)[0]);
      render();
      return;
    }
    const act = e.target.closest("[data-pz]");
    if (!act) return;
    switch (act.dataset.pz) {
      case "start": start(); break;
      case "quit": P = null; showView("games"); break;
      case "check": check(); break;
      case "next": next(); break;
      case "listen": Player.playSentence(P.cur.s.id); break;
      case "reset": P.pool.push(...P.answer); P.answer = []; P.state = "build"; P.wrongAt = []; render(); break;
      case "show": finish("shown"); break;
    }
  }
  document.addEventListener("click", e => { if (e.target.closest("#puzzle")) onClick(e); });

  function onKey(e) {
    if (!P || e.key !== "Enter") return;
    e.preventDefault();
    if (P.state === "build" && !P.pool.length) check();
    else if (["right", "alt", "shown"].includes(P.state)) next();
  }

  return { render, onKey, candidates, chunk, altOk };
})();
