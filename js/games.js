"use strict";
// Spiele: Übersicht (Satzpuzzle → puzzle.js), Wortwahl (Multiple Choice) und Paare finden.
// Die Spiele ändern nichts an der Lernkartei; Statistik in db.games = { mc: { total, correct }, pairs: { rounds, best } }.

const Games = (() => {
  const MC_ROUND = 10, PAIRS = 6;
  const MC_DIRS = { jd: "Japanisch → Deutsch", dj: "Deutsch → Japanisch", hd: "Hören → Deutsch" };
  let G = { mode: "hub" };   // hub | mc | pairs

  const stats = () => {
    const g = (Store.db.games = Object.assign({}, Store.db.games));
    g.mc = Object.assign({ total: 0, correct: 0 }, g.mc);
    g.pairs = Object.assign({ rounds: 0, best: null }, g.pairs);
    return g;
  };
  const prefs = () => (Store.db.prefs.games = Object.assign({ dir: "jd" }, Store.db.prefs.games));
  const say = vid => Speech.say(Content.sayText(vid), 0.9);
  const word = vid => wordHtml(vid);
  const unique = arr => [...new Set(arr)].filter(v => DICT[v] && DICT[v].de);

  // Wortwahl: Karten aus Fach 1 und die ganze Merkliste
  const mcPool = () => unique([
    ...Store.db.cards.filter(c => Scheduler.boxOf(c) === 1).map(c => c.vocabId),
    ...Store.db.saved.map(s => s.vocabId),
  ]);
  // Paare finden: alles, was gerade gelernt wird (Lernkartei und Merkliste)
  const pairsPool = () => unique([...Store.db.cards.map(c => c.vocabId), ...Store.db.saved.map(s => s.vocabId)]);

  // Falsche Antworten: andere Grundformen mit Bedeutung, wenn möglich derselben Wortart
  function distractors(vid, n) {
    const v = DICT[vid], seen = new Set([v.de, Content.display(vid)]);
    const all = Object.keys(DICT).filter(k => {
      const w = DICT[k];
      return k !== vid && !w.base && w.de && Content.isLearnable(k) && !seen.has(w.de) && !seen.has(Content.display(k));
    });
    const same = shuffle(all.filter(k => DICT[k].pos === v.pos));
    const out = [];
    for (const k of [...same, ...shuffle(all)]) {
      if (out.length >= n) break;
      if (out.includes(k) || out.some(o => DICT[o].de === DICT[k].de || Content.display(o) === Content.display(k))) continue;
      out.push(k);
    }
    return out;
  }

  // ---------- Übersicht ----------
  function renderHub(root) {
    const puzzleN = Puzzle.candidates().length, mcN = mcPool().length, pairsN = pairsPool().length, st = stats();
    const ps = Store.db.puzzle || { total: 0, perfect: 0 };
    const tile = (game, icon, title, text, info, ok) => `
      <button class="panel game-tile" data-game="${game}" ${ok ? "" : "disabled"}>
        <span class="game-icon jp">${icon}</span>
        <span class="game-body"><b>${title}</b><span>${text}</span><small class="hint">${info}</small></span>
      </button>`;
    root.innerHTML = `
      <div class="game-tiles">
        ${tile("puzzle", "並", "Satzpuzzle", "Sätze aus deinen Geschichten in die richtige Reihenfolge bringen.",
          puzzleN ? `${puzzleN} passende Sätze${ps.total ? ` · ${ps.total} gelöst, ${ps.perfect} auf Anhieb` : ""}` : "Noch keine passenden Sätze – erst ein paar Wörter mehr lernen.", puzzleN > 0)}
        ${tile("mc", "選", "Wortwahl", "Vier Antworten, eine stimmt. Mit allen Karten aus Fach 1 und der ganzen Merkliste.",
          mcN ? `${mcN} Wörter${st.mc.total ? ` · ${Math.round(st.mc.correct / st.mc.total * 100)} % richtig bei ${st.mc.total} Fragen` : ""}` : "Fach 1 und Merkliste sind leer.", mcN > 0)}
        ${tile("pairs", "対", "Paare finden", `${PAIRS} japanische Wörter und ihre Bedeutungen – so schnell wie möglich zuordnen.`,
          pairsN >= 3 ? `${pairsN} Wörter aus Lernkartei und Merkliste${st.pairs.best ? ` · Bestzeit ${fmtTime(st.pairs.best)}` : ""}` : "Mindestens 3 Wörter in Lernkartei oder Merkliste nötig.", pairsN >= 3)}
      </div>
      <p class="hint on-page">Die Spiele zählen nicht für die Lernkartei – üben, so oft du willst.</p>`;
  }
  const fmtTime = ms => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min` : `${s} s`; };

  // ---------- Wortwahl ----------
  function mcStart() {
    const pool = shuffle(mcPool()).slice(0, MC_ROUND);
    if (!pool.length) return;
    G = { mode: "mc", queue: pool, idx: 0, right: 0, wrong: 0, retried: new Set(), answered: null };
    mcLoad();
  }
  function mcLoad() {
    const vid = G.queue[G.idx];
    G.vid = vid;
    G.options = shuffle([vid, ...distractors(vid, 3)]);
    G.answered = null;
    render();
    if (prefs().dir !== "dj") say(vid);
  }
  function mcAnswer(i) {
    if (G.answered !== null) return;
    G.answered = i;
    const ok = G.options[i] === G.vid, st = stats();
    st.mc.total++;
    if (ok) { st.mc.correct++; G.right++; }
    else {
      G.wrong++;
      // Falsch beantwortet: kommt in dieser Runde ein paar Fragen später nochmal
      if (!G.retried.has(G.vid)) { G.retried.add(G.vid); G.queue.splice(Math.min(G.idx + 4, G.queue.length), 0, G.vid); }
    }
    Store.touchDay();
    Store.persist();
    render();
    if (prefs().dir === "dj") say(G.vid);
  }
  function mcNext() {
    G.idx++;
    if (G.idx >= G.queue.length) { G.end = true; render(); return; }
    mcLoad();
  }

  function renderMc(root) {
    const dir = prefs().dir;
    if (G.end) {
      root.innerHTML = `
        <div class="panel center">
          <h2>お疲れさま！ <small>Wortwahl</small></h2>
          <p><b>${G.right}</b> richtig · ${G.wrong} falsch</p>
          <div class="row center"><button class="secondary" data-g="mc-start">Nochmal</button><button class="primary" data-g="hub">Fertig</button></div>
        </div>`;
      return;
    }
    const vid = G.vid, v = DICT[vid], done = G.answered !== null;
    const prompt = dir === "dj" ? `<div class="mc-prompt">${escapeHtml(v.de)}</div>`
      : dir === "hd" && !done ? `<button class="mc-listen" data-g="say" aria-label="Nochmal anhören">🔊</button>`
      : `<div class="mc-prompt jp">${word(vid)}</div>`;
    const label = k => (dir === "dj" ? `<span class="jp">${word(k)}</span>` : escapeHtml(DICT[k].de));
    root.innerHTML = `
      <div class="session-top"><span class="hint on-page"><b>Wortwahl</b> · ${G.idx + 1} von ${G.queue.length} · ${G.right} richtig</span><button class="link on-page" data-g="hub">Beenden</button></div>
      <div class="panel mc">
        <div class="segmented mc-dir">${Object.entries(MC_DIRS).map(([k, t]) => `<button data-g="dir" data-v="${k}" class="${k === dir ? "active" : ""}">${t}</button>`).join("")}</div>
        ${prompt}
        ${done && dir === "dj" ? `<p class="hint">${escapeHtml(v.r)}</p>` : ""}
        ${done && dir !== "dj" ? `<p class="mc-meaning">${escapeHtml(v.de)}</p>` : ""}
        <div class="mc-options">${G.options.map((k, i) => {
          const cls = !done ? "" : k === vid ? "right" : i === G.answered ? "wrong" : "dim";
          return `<button class="mc-option ${cls}" data-g="answer" data-i="${i}" ${done ? "disabled" : ""}><kbd>${i + 1}</kbd>${label(k)}</button>`;
        }).join("")}</div>
        ${done ? `<div class="row center">
          ${dir !== "dj" ? "" : `<button class="secondary" data-g="say">🔊 Wort</button>`}
          <button class="primary" data-g="mc-next">Weiter <kbd>⏎</kbd></button></div>` : ""}
      </div>`;
  }

  // ---------- Paare finden ----------
  function pairsStart() {
    // Keine zwei Wörter mit derselben Bedeutung auf einem Brett
    const vids = [];
    for (const v of shuffle(pairsPool())) {
      if (vids.length >= PAIRS) break;
      if (!vids.some(o => DICT[o].de === DICT[v].de)) vids.push(v);
    }
    if (vids.length < 3) return;
    G = { mode: "pairs", vids, left: shuffle(vids), right: shuffle(vids), sel: null, matched: new Set(), misses: 0, wrongPair: null, start: Date.now() };
    render();
  }
  function pairsPick(side, vid) {
    if (G.matched.has(vid) || G.time) return;
    if (side === "l") { G.sel = vid; G.wrongPair = null; say(vid); render(); return; }
    if (!G.sel) return;
    if (G.sel === vid) {
      G.matched.add(vid);
      G.sel = null;
      if (G.matched.size === G.vids.length) {
        G.time = Date.now() - G.start;
        const st = stats();
        st.pairs.rounds++;
        G.record = G.vids.length === PAIRS && (!st.pairs.best || G.time < st.pairs.best);
        if (G.record) st.pairs.best = G.time;
        Store.touchDay();
        Store.persist();
      }
    } else {
      G.misses++;
      G.wrongPair = [G.sel, vid];
      G.sel = null;
    }
    render();
  }
  function renderPairs(root) {
    const tile = (side, vid) => {
      const cls = G.matched.has(vid) ? "matched" : G.sel === vid && side === "l" ? "sel"
        : G.wrongPair && G.wrongPair[side === "l" ? 0 : 1] === vid ? "wrong" : "";
      return `<button class="pair ${cls}" data-g="pair" data-side="${side}" data-vid="${escapeHtml(vid)}" ${G.matched.has(vid) ? "disabled" : ""}>${side === "l" ? `<span class="jp">${word(vid)}</span>` : escapeHtml(DICT[vid].de)}</button>`;
    };
    root.innerHTML = `
      <div class="session-top"><span class="hint on-page"><b>Paare finden</b> · ${G.matched.size} von ${G.vids.length} · ${G.misses} Fehler</span><button class="link on-page" data-g="hub">Beenden</button></div>
      <div class="panel">
        ${G.time ? `<div class="center"><h2>${G.record ? "新記録！ <small>Neue Bestzeit</small>" : "できた！ <small>Geschafft</small>"}</h2>
          <p><b>${fmtTime(G.time)}</b> · ${G.misses} Fehler</p>
          <div class="row center"><button class="secondary" data-g="pairs-start">Neue Runde</button><button class="primary" data-g="hub">Fertig</button></div></div>`
          : `<p class="hint center">Erst links ein japanisches Wort antippen, dann rechts die passende Bedeutung.</p>`}
        <div class="pairs">
          <div class="pairs-col">${G.left.map(v => tile("l", v)).join("")}</div>
          <div class="pairs-col">${G.right.map(v => tile("r", v)).join("")}</div>
        </div>
      </div>`;
  }

  // ---------- Steuerung ----------
  function render() {
    const root = $("#games");
    if (!root) return;
    if (Content.stories.length < Content.catalog.length) {
      root.innerHTML = `<div class="panel center"><p class="hint">Geschichten werden geladen …</p></div>`;
      Content.loadAll().then(() => { if (currentView === "games") render(); });
      return;
    }
    if (G.mode === "mc") renderMc(root);
    else if (G.mode === "pairs") renderPairs(root);
    else renderHub(root);
  }

  $("#games").addEventListener("click", e => {
    const tileBtn = e.target.closest("[data-game]");
    if (tileBtn) {
      const g = tileBtn.dataset.game;
      if (g === "puzzle") showView("puzzle");
      else if (g === "mc") mcStart();
      else if (g === "pairs") pairsStart();
      return;
    }
    const b = e.target.closest("[data-g]");
    if (!b) return;
    switch (b.dataset.g) {
      case "hub": G = { mode: "hub" }; render(); break;
      case "mc-start": mcStart(); break;
      case "mc-next": mcNext(); break;
      case "answer": mcAnswer(Number(b.dataset.i)); break;
      case "dir": prefs().dir = b.dataset.v; Store.persist(false); if (G.answered === null) mcLoad(); else render(); break;
      case "say": say(G.vid); break;
      case "pairs-start": pairsStart(); break;
      case "pair": pairsPick(b.dataset.side, b.dataset.vid); break;
    }
  });

  function onKey(e) {
    if (G.mode !== "mc" || G.end) return;
    if (G.answered === null && /^[1-4]$/.test(e.key)) mcAnswer(Number(e.key) - 1);
    else if (G.answered !== null && e.key === "Enter") { e.preventDefault(); mcNext(); }
  }

  return { render, onKey, reset: () => { G = { mode: "hub" }; } };
})();
