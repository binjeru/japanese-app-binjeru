"use strict";
// Oberfläche der Heisig-Rubrik: Übersicht, neue Rahmen lernen, Wiederholen, Detailansicht

const KanjiView = (() => {
  const root = $("#kanji");
  let K = { mode: "overview", block: 0 }; // mode: overview | learn | review | detail
  const BOX_LABEL = n => `Fach ${n} · ${Scheduler.BOX_NAMES[n]}`;

  function show(mode, extra = {}) {
    K = { ...K, ...extra, mode };
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    if (K.mode === "learn") renderLearn();
    else if (K.mode === "review") renderReview();
    else if (K.mode === "detail") renderDetail();
    else renderOverview();
  }

  // Strichfolge in ein Element zeichnen (lädt den Block bei Bedarf)
  function drawKanji(el, n, animate = true) {
    const k = Heisig.frame(n);
    el.innerHTML = `<div class="kanji-fallback jp">${k.kanji}</div>`;
    KanjiStrokes.load(n)
      .then(() => KanjiStrokes.render(el, k.kanji, { animate }))
      .catch(() => { el.insertAdjacentHTML("beforeend", `<p class="hint">Strichfolge konnte nicht geladen werden.</p>`); });
  }

  const facts = k => `
    <div class="kanji-facts">
      <span><b>${k.strokes}</b> Striche</span>
      ${k.on ? `<span>On: <span class="jp">${escapeHtml(k.on)}</span></span>` : ""}
      ${k.kun ? `<span>Kun: <span class="jp">${escapeHtml(k.kun)}</span></span>` : ""}
      <span>engl.: ${escapeHtml(k.en)}</span>
    </div>`;

  function fmtNext(t) {
    const days = Math.round((Scheduler.dayStart(t) - Scheduler.dayStart(Date.now())) / Scheduler.DAY);
    return days <= 0 ? "heute" : days === 1 ? "morgen" : `in ${days} Tagen`;
  }

  // ---------- Übersicht ----------
  function renderOverview() {
    const now = Date.now();
    const due = Heisig.dueQueue(now).length;
    const practice = Heisig.practiceCards(now).length;
    const next = Heisig.nextFrame();
    const allowance = Heisig.newAllowance(now);
    const cards = Store.db.heisig.cards;
    const boxes = [1, 2, 3, 4, 5].map(b => cards.filter(c => c.box === b).length);
    const nextDue = cards.filter(c => c.dueAt > now).sort((a, b) => a.dueAt - b.dueAt)[0];
    const start = K.block * 200 + 1;
    const blocks = Math.ceil(Heisig.TOTAL / 200);

    root.innerHTML = `
      <div class="panel kanji-head">
        <div class="kanji-progress-row"><b>Rahmen ${Heisig.unlocked} von ${Heisig.TOTAL}</b><span class="hint">${Math.round((Heisig.unlocked / Heisig.TOTAL) * 100)} %</span></div>
        <div class="progress"><div class="progress-bar" style="width:${(Heisig.unlocked / Heisig.TOTAL) * 100}%"></div></div>
        <div class="row center">
          ${due ? `<button class="primary big" data-k="review">Tagesabfrage · ${due}</button>` : ""}
          ${next && allowance ? `<button class="primary big" data-k="learn">Neue Rahmen lernen · ab ${next} (heute noch ${allowance})</button>` : ""}
          ${practice ? `<button class="secondary" data-k="practice">Fach 1 üben · ${practice} (zählt nicht)</button>` : ""}
        </div>
        ${due ? `<p class="hint center">Erst die fälligen Kanji – danach kannst du neue Rahmen lernen. Nicht gewusst → zurück in Fach 1.</p>`
          : `<p class="hint center">${cards.length ? "✓ Tagesabfrage erledigt." : "Noch keine Kanji in der Kartei."}${nextDue && !Heisig.dueTotal(now) ? ` Nächste Abfrage ${fmtNext(nextDue.dueAt)}.` : ""}${Heisig.dueTotal(now) ? ` Für heute genug abgefragt – der Rest kommt morgen.` : ""}${next && !allowance && cards.length ? " Für heute sind genug neue Rahmen dazugekommen." : ""}</p>`}
      </div>
      <div class="boxes4 boxes5 compact">${boxes.map((n, i) => `
        <div class="box4 box4-${i + 1}"><div class="box4-head"><b>Fach ${i + 1}</b><span>${Scheduler.BOX_NAMES[i + 1]}</span></div><div class="box4-count">${n}</div></div>`).join("")}
      </div>
      <div class="panel">
        <h3>Alle Rahmen</h3>
        <div class="block-tabs">${Array.from({ length: blocks }, (_, b) =>
          `<button class="${b === K.block ? "active" : ""}" data-block="${b}">${b * 200 + 1}–${Math.min((b + 1) * 200, Heisig.TOTAL)}</button>`).join("")}</div>
        <div class="kanji-grid">${Heisig.KANJI.slice(start - 1, start + 199).map(k => {
          const st = Heisig.status(k.n);
          const kw = Heisig.keyword(k.n);
          return `<button class="kcell st-${st}" data-frame="${k.n}" title="Rahmen ${k.n}${kw ? ` · ${escapeHtml(kw)}` : ""}"><span class="jp">${k.kanji}</span><small>${k.n}</small></button>`;
        }).join("")}</div>
        <p class="hint legend-row"><span class="kdot st-locked"></span>noch nicht gelernt <span class="kdot st-box1"></span>Fach 1 <span class="kdot st-box2"></span>Fach 2 <span class="kdot st-box3"></span>Fach 3 <span class="kdot st-box4"></span>Fach 4 <span class="kdot st-box5"></span>Fach 5</p>
      </div>
      <div class="panel">
        <h3>Einstellungen</h3>
        <div class="field"><label>Neue Rahmen pro Tag</label>
          <div class="segmented" id="k-perday">${[5, 10, 15, 20].map(n => `<button data-v="${n}">${n}</button>`).join("")}</div></div>
        <div class="field"><label for="k-until">Bereits gelernt bis Rahmen</label>
          <div class="row" style="margin-top:0"><input type="number" id="k-until" min="0" max="${Heisig.TOTAL}" value="${Heisig.unlocked}" class="num-input">
          <button class="secondary" data-k="until">Übernehmen</button></div>
          <p class="hint">Übernommene Rahmen kommen gestaffelt über zwei Wochen zur Wiederholung.</p></div>
        <p class="hint">Reihenfolge und Nummern entsprechen „Die Kanji lernen und behalten 1“ (6. Auflage, 2200 Zeichen).
          Schlüsselwörter und Geschichten aus dem Buch sind urheberrechtlich geschützt und deshalb nicht in der App enthalten.
          ${KanjiSuggest.count ? `Vorschläge aus deinem Anki-Deck: <b>${KanjiSuggest.count}</b> Rahmen (privat in deinem Daten-Repo) – beim ersten Lernen übernimmst du die Geschichte oder schreibst eine eigene.`
            : "Vorschläge aus deinem Anki-Deck werden über den Abgleich mit GitHub geladen; ohne sie trägst du Schlüsselwort und Geschichte selbst ein."}</p>
      </div>`;
    segmented($("#k-perday", root), String(Heisig.newPerDay), v => { Heisig.setNewPerDay(Number(v)); renderOverview(); });
  }

  // ---------- Neue Rahmen lernen ----------
  function renderLearn() {
    const n = Heisig.nextFrame();
    const allowance = Heisig.newAllowance();
    if (!n || !allowance) {
      const practice = Heisig.practiceCards().length;
      const due = Heisig.dueQueue().length;
      root.innerHTML = `
        <div class="panel center">
          <h2>${due ? "Erst die Tagesabfrage" : n ? "Für heute genug neue Rahmen" : "Alle 2200 Rahmen gelernt! 🎉"}</h2>
          <p>${K.learnedNow ? `Heute neu: <b>${K.learnedNow}</b> Rahmen. ` : ""}${practice ? "Die neuen Rahmen liegen in Fach 1 – üb sie heute, so oft du willst. Abgefragt werden sie ab morgen." : ""}</p>
          <div class="row center">
            ${due ? `<button class="primary big" data-k="review">Tagesabfrage · ${due}</button>` : ""}
            ${practice ? `<button class="${due ? "secondary" : "primary big"}" data-k="practice">Fach 1 üben · ${practice}</button>` : ""}
            <button class="secondary" data-k="overview">Zur Übersicht</button>
          </div>
        </div>`;
      return;
    }
    const k = Heisig.frame(n);
    const e = Heisig.entry(n);
    const sug = Heisig.suggestion(n);
    // Mit Vorschlag (eigenes Anki-Deck): Geschichte übernehmen oder selbst neu schreiben
    if (K.learnFrame !== n) { K.learnFrame = n; K.write = false; }
    const proposal = sug && sug.s && !e.story ? sug : null;
    root.innerHTML = `
      <div class="session-top"><span class="hint on-page">Neuer Rahmen · heute noch ${allowance}</span><button class="link on-page" data-k="overview">Beenden</button></div>
      <div class="panel kanji-learn">
        <div class="frame-no">Rahmen ${n}</div>
        <div class="kanji-stage" id="k-stage"></div>
        <div class="row center"><button class="secondary" data-k="replay">↻ Strichfolge</button></div>
        ${facts(k)}
        <div class="field"><label for="k-keyword">Schlüsselwort</label>
          <input id="k-keyword" class="text-input kw-input" value="${escapeHtml(e.keyword || (sug && sug.kw) || "")}" placeholder="z. B. Wasser" autocomplete="off"></div>
        ${proposal && !K.write ? `
          <div class="field"><label>Merkgeschichte (Vorschlag)</label>
            <div class="kanji-story proposal">${escapeHtml(proposal.s)}</div></div>
          <div class="row center">
            <button class="secondary" data-k="write">✎ Neu schreiben</button>
            <button class="primary big" data-k="accept">✓ Übernehmen – weiter</button>
          </div>` : `
          <div class="field"><label for="k-story">Deine Geschichte / dein Merksatz <span class="hint">(optional)</span></label>
            ${sug && sug.s ? `<p class="hint proposal-ref">Vorschlag: ${escapeHtml(sug.s)}</p>` : ""}
            <textarea id="k-story" class="text-input" rows="3" placeholder="Bilder aus den Bestandteilen …">${escapeHtml(e.story)}</textarea></div>
          <div class="row center">
            ${proposal ? `<button class="secondary" data-k="unwrite">Doch den Vorschlag nehmen</button>` : ""}
            <button class="primary big" data-k="learned">Gelernt – weiter</button>
          </div>`}
      </div>`;
    drawKanji($("#k-stage", root), n);
    if (K.write) $("#k-story", root).focus();
    else if (!$("#k-keyword", root).value) $("#k-keyword", root).focus();
  }

  // Rahmen als gelernt eintragen (Schlüsselwort + Geschichte) und zum nächsten
  function learnCurrent(story) {
    const kw = $("#k-keyword", root).value;
    if (!kw.trim() && !confirm("Ohne Schlüsselwort weiter? Bei der Abfrage wird dann die englische Bedeutung angezeigt.")) return;
    Heisig.learn(Heisig.nextFrame(), kw, story);
    K.learnedNow = (K.learnedNow || 0) + 1;
    renderLearn();
    window.scrollTo(0, 0);
  }

  // ---------- Wiederholen (Schlüsselwort → Kanji) ----------
  // reviewMode "due": Tagesabfrage · "practice": Fach 1 frei üben (ohne Wirkung)
  function startReview(reviewMode = "due") {
    // Welche Kanji drankommen, bestimmt der Scheduler; die Reihenfolge ist zufällig
    const cards = shuffle(reviewMode === "practice" ? Heisig.practiceCards() : Heisig.dueQueue());
    if (!cards.length) { toast(reviewMode === "practice" ? "In Fach 1 ist heute nichts zu üben." : "Gerade ist kein Kanji fällig."); return; }
    show("review", { reviewMode, queue: cards.map(c => c.id), revealed: false, storyOpen: false, drawn: [], check: null, done: 0, good: 0, again: 0 });
  }

  function renderReview() {
    if (!K.queue.length) {
      const due = K.reviewMode === "due";
      const practice = Heisig.practiceCards().length;
      root.innerHTML = `
        <div class="panel center">
          <h2>お疲れさま！ <small>${due ? "Tagesabfrage erledigt" : "Fach 1 geübt"}</small></h2>
          <p>${due ? `<b>${K.done}</b> Kanji abgefragt · ${K.good}× gewusst · ${K.again}× zurück in Fach 1`
            : `${K.done} Durchgänge geübt. Ob die Rahmen in Fach 2 kommen, entscheidet die Abfrage morgen.`}</p>
          <div class="row center">
            ${due && Heisig.nextFrame() && Heisig.newAllowance() ? `<button class="secondary" data-k="learn">Neue Rahmen lernen</button>` : ""}
            ${due && practice ? `<button class="secondary" data-k="practice">Fach 1 üben · ${practice}</button>` : ""}
            <button class="primary" data-k="overview">Fertig</button>
          </div>
        </div>`;
      return;
    }
    const card = Store.db.heisig.cards.find(c => c.id === K.queue[0]);
    const n = card.frame, k = Heisig.frame(n), e = Heisig.entry(n);
    const box = Scheduler.boxOf(card);
    root.innerHTML = `
      <div class="session-top"><span class="hint on-page"><b>${K.reviewMode === "due" ? "Tagesabfrage" : "Fach 1 üben – zählt nicht"}</b> · ${K.done} erledigt · ${K.queue.length} übrig</span><button class="link on-page" data-k="overview">${K.reviewMode === "due" ? "Unterbrechen" : "Beenden"}</button></div>
      <div class="panel flash kanji-flash">
        <span class="tag box-tag box4-${box}">${BOX_LABEL(box)}</span>
        <div class="frame-no">Rahmen ${n}</div>
        <div class="kanji-keyword">${escapeHtml(Heisig.promptText(n))}</div>
        ${Heisig.storyOf(n) ? (K.storyOpen || K.revealed ? `<div class="kanji-story">${escapeHtml(Heisig.storyOf(n))}</div>` : `<button class="link" data-k="story">${e.story ? "Meine Geschichte zeigen" : "Geschichte zeigen"}</button>`) : ""}
        ${K.revealed ? `
          ${K.check ? `
            <div class="draw-compare">
              <figure><div class="kanji-stage">${KanjiDraw.svg(K.drawn, K.check)}</div><figcaption class="hint">Deine Zeichnung</figcaption></figure>
              <figure><div class="kanji-stage" id="k-stage"></div><figcaption class="hint">Richtig</figcaption></figure>
            </div>
            <p class="draw-verdict ${K.check.verdict}">${escapeHtml(K.check.text)}</p>`
            : `<div class="kanji-stage" id="k-stage"></div>`}
          <div class="row center"><button class="secondary" data-k="replay">↻ Strichfolge</button><button class="secondary" data-k="edit">✎ Bearbeiten</button></div>
          <details class="fold"><summary>Striche &amp; Lesungen</summary>${facts(k)}</details>` : `
          <div class="draw-pad" id="k-pad"></div>
          <div class="row center draw-tools">
            <button class="secondary" data-k="undo">↶ Strich zurück</button>
            <button class="secondary" data-k="clear">Löschen</button>
          </div>
          <p class="hint">Zeichne das Kanji mit dem Finger – oder schreib es auf Papier und deck einfach auf.</p>`}
        <div class="row center rate-row">
          ${K.revealed ? `
            <button class="rate bad ${K.check && K.check.verdict === "again" ? "suggest" : ""}" data-k="again">Noch nicht <kbd>1</kbd></button>
            <button class="rate good ${K.check && K.check.verdict === "good" ? "suggest" : ""}" data-k="good">Gewusst <kbd>2</kbd></button>`
            : `<button class="primary big" data-k="reveal" id="k-reveal">${K.drawn.length ? "Prüfen & aufdecken" : "Aufdecken"} <kbd>Leertaste</kbd></button>`}
        </div>
      </div>`;
    KanjiStrokes.load(n).catch(() => {});   // für den Abgleich schon mal laden
    if (K.revealed) drawKanji($("#k-stage", root), n);
    else {
      K.pad = KanjiDraw.pad($("#k-pad", root), {
        strokes: K.drawn,
        onChange: st => { $("#k-reveal", root).firstChild.textContent = st.length ? "Prüfen & aufdecken " : "Aufdecken "; },
      });
    }
  }

  // Aufdecken; wenn gezeichnet wurde, vorher mit der Strichfolge abgleichen
  async function reveal() {
    const card = Store.db.heisig.cards.find(c => c.id === K.queue[0]);
    K.check = null;
    if (K.drawn.length) {
      const k = Heisig.frame(card.frame);
      try {
        await KanjiStrokes.load(card.frame);
        const paths = KanjiStrokes.get(k.kanji);
        if (paths) K.check = KanjiDraw.compare(K.drawn, paths);
      } catch { /* ohne Strichdaten einfach aufdecken */ }
    }
    K.revealed = true;
    renderReview();
  }

  function rate(rating) {
    const id = K.queue.shift();
    K.done++;
    rating === "good" ? K.good++ : K.again++;
    if (K.reviewMode === "due") Heisig.review(id, rating);
    else {
      Heisig.practice(id, rating);
      if (rating === "again") K.queue.splice(Math.min(3, K.queue.length), 0, id);
    }
    K.revealed = false;
    K.storyOpen = false;
    K.drawn = [];
    K.check = null;
    renderReview();
  }

  // ---------- Detailansicht ----------
  function renderDetail() {
    const n = K.frame, k = Heisig.frame(n), e = Heisig.entry(n);
    const card = Heisig.cardOf(n);
    root.innerHTML = `
      <div class="session-top"><button class="link on-page" data-k="${K.back || "overview"}">← Zurück</button></div>
      <div class="panel kanji-learn">
        <div class="frame-no">Rahmen ${n}${card ? ` · ${BOX_LABEL(Scheduler.boxOf(card))} · fällig ${fmtNext(card.dueAt)}` : ""}</div>
        <div class="kanji-stage" id="k-stage"></div>
        <div class="row center"><button class="secondary" data-k="replay">↻ Strichfolge</button></div>
        ${facts(k)}
        <div class="field"><label for="k-keyword">Schlüsselwort</label><input id="k-keyword" class="text-input" value="${escapeHtml(Heisig.keyword(n))}" autocomplete="off"></div>
        <div class="field"><label for="k-story">Geschichte / Merksatz</label><textarea id="k-story" class="text-input" rows="3">${escapeHtml(Heisig.storyOf(n))}</textarea></div>
        <div class="row center"><button class="primary" data-k="save">Speichern</button></div>
      </div>`;
    drawKanji($("#k-stage", root), n);
  }

  root.addEventListener("click", e => {
    const blk = e.target.closest("[data-block]");
    if (blk) { K.block = Number(blk.dataset.block); renderOverview(); return; }
    const cell = e.target.closest("[data-frame]");
    if (cell) {
      const n = Number(cell.dataset.frame);
      if (n > Heisig.unlocked) { toast(`Rahmen ${n} kommt nach Rahmen ${n - 1} – Heisigs Reihenfolge.`); return; }
      show("detail", { frame: n, back: "overview" });
      return;
    }
    const act = e.target.closest("[data-k]");
    if (!act) return;
    switch (act.dataset.k) {
      case "overview": show("overview"); break;
      case "learn": show("learn", { learnedNow: 0 }); break;
      case "review": startReview("due"); break;
      case "practice": startReview("practice"); break;
      case "replay": { const st = $("#k-stage", root); const n = K.mode === "review" ? Store.db.heisig.cards.find(c => c.id === K.queue[0]).frame : K.mode === "detail" ? K.frame : Heisig.nextFrame(); drawKanji(st, n); break; }
      case "learned": learnCurrent($("#k-story", root).value); break;
      case "accept": learnCurrent(Heisig.suggestion(Heisig.nextFrame()).s); break;
      case "write": case "unwrite": {
        const kw = $("#k-keyword", root).value;   // schon geändertes Schlüsselwort behalten
        K.write = act.dataset.k === "write";
        renderLearn();
        $("#k-keyword", root).value = kw;
        break;
      }
      case "story": K.storyOpen = true; renderReview(); break;
      case "reveal": reveal(); break;
      case "undo": if (K.pad) K.pad.undo(); break;
      case "clear": if (K.pad) K.pad.clear(); break;
      case "again": rate("again"); break;
      case "good": rate("good"); break;
      case "edit": { const n = Store.db.heisig.cards.find(c => c.id === K.queue[0]).frame; show("detail", { frame: n, back: "review" }); break; }
      case "save": Heisig.saveEntry(K.frame, $("#k-keyword", root).value, $("#k-story", root).value); toast("Gespeichert"); show(K.back || "overview"); break;
      case "until": {
        const n = Number($("#k-until", root).value);
        if (!(n > Heisig.unlocked)) { toast(`Bitte eine Zahl größer als ${Heisig.unlocked} eingeben.`); return; }
        if (!confirm(`Rahmen ${Heisig.unlocked + 1} bis ${n} als bereits gelernt übernehmen?`)) return;
        const added = Heisig.markLearnedUntil(n);
        toast(`${added} Rahmen übernommen`);
        renderOverview();
        break;
      }
    }
  });

  function onKey(e) {
    if (K.mode !== "review" || !K.queue || !K.queue.length) return;
    if (e.target.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
    if (e.key === " " && !K.revealed) { e.preventDefault(); reveal(); }
    else if (K.revealed && e.key === "1") rate("again");
    else if (K.revealed && e.key === "2") rate("good");
  }

  // Beim Öffnen des Tabs: abgeschlossene Abfrage → Übersicht
  return { render: () => { if (K.mode === "review" && !(K.queue && K.queue.length)) K.mode = "overview"; render(); }, onKey };
})();
