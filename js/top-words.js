"use strict";
// Top 2000: die häufigsten lernbaren Wörter des Japanischen (data/top2000.js, bei Bedarf geladen)
// und wie weit du sie kannst. Zwei Darstellungen: Raster (wie die Kanji-Übersicht) und Wandteppich –
// ein Holzschnitt aus 2000 Fäden; jedes gefestigte Wort webt seinen Faden ein, verstreut über das Bild.
//
// Zuordnung zu deinem Lernstand: über das Wörterbuch der Geschichten (Schlüssel oder Kanji-
// Schreibweise). Wörter, die in keiner Geschichte vorkommen, kannst du direkt als bekannt markieren.

const TopWords = (() => {
  const root = $("#top");
  const BLOCK = 250;
  const COLS = 50;                                   // Wandteppich: 50 × 40 Fäden
  const ART = ["fuji", "tebukuro", "neko", "kouen", "himitsu", "asagohan", "momotaro"];
  let words = null;                                  // [{ n, rank, w, r, de, pos }]
  let loading = null;
  let index = null;                                  // Schreibweise → Wörterbuch-Schlüssel
  const V = { mode: "grid", block: 0, filter: "all", sel: null };

  function load() {
    if (words) return Promise.resolve(words);
    if (!loading) loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "data/top2000.js";
      s.onload = () => {
        words = TOP_WORDS.map(([rank, w, r, de, pos], i) => ({ n: i + 1, rank, w, r: r || w, de, pos }));
        resolve(words);
      };
      s.onerror = () => { loading = null; reject(new Error("data/top2000.js nicht gefunden")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  // Wörterbuch-Index (nach dem Laden aller Geschichten vollständig)
  function buildIndex() {
    index = {};
    for (const [key, e] of Object.entries(DICT)) {
      if (e.base) continue;
      if (!index[key]) index[key] = key;
      if (e.k && !index[e.k]) index[e.k] = key;
    }
  }
  // Index neu aufbauen, sobald weitere Geschichten (und damit Wörter) geladen sind
  let indexSize = 0;
  function ensureIndex() {
    const n = Object.keys(DICT).length;
    if (!index || n !== indexSize) { buildIndex(); indexSize = n; }
  }
  const vidOf = t => (index && index[t.w]) || null;

  // "known" | "learning" | "saved" | "unknown" (kommt in Geschichten vor) | "absent" (noch in keiner)
  function status(t) {
    const vid = vidOf(t);
    if (vid) return Store.mastery(vid);
    const uv = Store.db.userVocab[t.w];
    return uv && uv.known ? "known" : "absent";
  }

  function summary() {
    if (!words) return null;
    ensureIndex();
    const s = { total: words.length, known: 0, learning: 0, saved: 0, unknown: 0, absent: 0, inStories: 0 };
    for (const t of words) { const st = status(t); s[st]++; if (vidOf(t)) s.inStories++; }
    return s;
  }

  // ---------- Darstellung ----------
  const LABEL = { known: "gefestigt", learning: "in der Lernkartei", saved: "auf der Merkliste", unknown: "in Geschichten, noch offen", absent: "noch in keiner Geschichte" };

  function render() {
    if (!words || Content.stories.length < Content.catalog.length) {
      root.innerHTML = `<div class="panel"><p class="hint">Wörter werden geladen …</p></div>`;
      Promise.all([load(), Content.loadAll()]).then(() => { index = null; if (currentView === "top") render(); })
        .catch(err => { root.innerHTML = `<div class="panel"><p class="hint">${escapeHtml(err.message)}</p></div>`; });
      return;
    }
    ensureIndex();
    const s = summary();
    root.innerHTML = `
      <div class="session-top"><button class="link on-page" data-goto="profile">← Profil</button></div>
      <div class="panel top-head">
        <div class="top-tile-num"><b>${s.known}</b> / ${s.total} gefestigt <span class="hint">· ${Math.round((s.known / s.total) * 100)} %</span></div>
        <span class="top-bar">${["known", "learning", "saved"].map(k => `<span class="tb-${k}" style="width:${(s[k] / s.total) * 100}%"></span>`).join("")}</span>
        <p class="hint legend-row">${["known", "learning", "saved", "unknown", "absent"].map(k => `<span class="tdot td-${k}"></span>${LABEL[k]} (${s[k]})`).join(" ")}</p>
        <div class="row center">
          <div class="segmented small" id="tw-mode"><button data-v="grid">▦ Raster</button><button data-v="tapestry">🧵 Wandteppich</button></div>
        </div>
      </div>
      <div id="tw-body"></div>
      <div class="ws-sheet-slot" id="tw-detail"></div>`;
    segmented($("#tw-mode", root), V.mode, v => { V.mode = v; V.sel = null; renderBody(); });
    renderBody();
  }

  function renderBody() {
    ensureIndex();
    const body = $("#tw-body", root);
    if (V.mode === "tapestry") { body.innerHTML = tapestryHtml(); renderDetail(); return; }
    const blocks = Math.ceil(words.length / BLOCK);
    const list = words.slice(V.block * BLOCK, V.block * BLOCK + BLOCK).filter(t => V.filter === "all" || status(t) === V.filter ||
      (V.filter === "open" && ["unknown", "absent"].includes(status(t))));
    body.innerHTML = `
      <div class="panel">
        <div class="block-tabs">${Array.from({ length: blocks }, (_, b) =>
          `<button class="${b === V.block ? "active" : ""}" data-tb="${b}">${b * BLOCK + 1}–${Math.min((b + 1) * BLOCK, words.length)}</button>`).join("")}</div>
        <div class="segmented small tw-filter" id="tw-filter">
          <button data-v="all">Alle</button><button data-v="known">Gefestigt</button><button data-v="learning">Lernkartei</button><button data-v="saved">Merkliste</button><button data-v="open">Offen</button>
        </div>
        <div class="word-grid">${list.map(t => `
          <button class="wcell td-${status(t)} ${V.sel === t.n ? "sel" : ""}" data-tw="${t.n}" title="${escapeHtml(`${t.r} · ${t.de}`)}">
            <span class="jp">${escapeHtml(t.w)}</span><small>${t.n}</small></button>`).join("") || `<p class="hint">Keine Wörter in dieser Auswahl.</p>`}</div>
      </div>`;
    segmented($("#tw-filter", body), V.filter, v => { V.filter = v; renderBody(); });
    renderDetail();
  }

  // Wandteppich: Bild unter COLS × ROWS Fäden, die Wörter in ihrer Rangfolge Zeile für Zeile.
  // Gefestigt → der Faden zeigt das Bild in voller Farbe, in der Lernkartei → nur als Ahnung,
  // sonst ist vom Motiv kaum etwas zu sehen.
  function tapestryHtml() {
    const p = Store.db.prefs;
    const artId = ART.includes(p.topArt) ? p.topArt : "fuji";
    const art = Content.meta(artId).art;
    const total = words.length, rows = Math.ceil(total / COLS);
    const cells = new Array(COLS * rows).fill(null);
    for (const t of words) cells[t.n - 1] = t;
    const s = summary();
    return `
      <div class="panel top-tapestry">
        <div class="tw-art-pick">Motiv: ${ART.map(id => `<button class="chip toggle ${id === artId ? "on" : ""}" data-art="${id}">${escapeHtml(Content.meta(id).titleJp)}</button>`).join("")}</div>
        <div class="big-tapestry ${s.known === total ? "done" : ""}">
          <div class="bt-cloth" style="--cols:${COLS};--rows:${rows};background-image:url('${art.src}');background-position:${art.pos || "50% 50%"}">${cells.map(t =>
            t ? `<span class="bt-cell td-${status(t)} ${V.sel === t.n ? "sel" : ""}" data-tw="${t.n}"></span>` : `<span class="bt-cell td-absent"></span>`).join("")}</div>
        </div>
        <p class="hint center">${s.known} von ${total} Fäden gewebt · Faden antippen zeigt das Wort · Bild: ${escapeHtml(art.credit)}</p>
      </div>`;
  }

  function renderDetail() {
    ensureIndex();
    const slot = $("#tw-detail", root);
    const t = V.sel && words[V.sel - 1];
    if (!t) { slot.innerHTML = ""; return; }
    const st = status(t), vid = vidOf(t);
    slot.innerHTML = `
      <div class="panel tw-detail">
        <button class="sheet-close" data-twx="close" aria-label="Schließen">×</button>
        <div class="tw-d-word jp">${furiganaHtml(t.w, t.r)}</div>
        <div class="ws-reading"><span class="jp">${escapeHtml(t.r)}</span> · ${escapeHtml(kanaToRomaji(t.r))} ${t.pos ? `<span class="tag">${escapeHtml(t.pos)}</span>` : ""}</div>
        <div class="ws-meaning">${escapeHtml(t.de)}</div>
        <p class="hint">Platz ${t.n} der häufigsten Wörter · <span class="tdot td-${st}"></span>${LABEL[st]}</p>
        <div class="row center">
          ${vid ? `<button class="secondary" data-twx="sheet">Wortdetails &amp; Beispielsatz</button>`
            : `<button class="secondary" data-twx="known">${st === "known" ? "Doch nicht bekannt" : "Kenne ich schon"}</button>`}
        </div>
        ${vid ? "" : `<p class="hint">Kommt noch in keiner deiner Geschichten vor – über die Werkstatt kannst du eine Geschichte mit solchen Wörtern schreiben lassen.</p>`}
      </div>`;

  }

  root.addEventListener("click", e => {
    const tb = e.target.closest("[data-tb]");
    if (tb) { V.block = Number(tb.dataset.tb); V.sel = null; renderBody(); return; }
    const art = e.target.closest("[data-art]");
    if (art) { Store.db.prefs.topArt = art.dataset.art; Store.persist(); renderBody(); return; }
    const cell = e.target.closest("[data-tw]");
    if (cell) { V.sel = Number(cell.dataset.tw); renderBody(); return; }
    const x = e.target.closest("[data-twx]");
    if (!x) return;
    const t = words[V.sel - 1];
    if (x.dataset.twx === "close") { V.sel = null; renderBody(); }
    else if (x.dataset.twx === "sheet") {
      const vid = vidOf(t);
      const s = Content.firstSentenceAny(vid);
      WordSheet.open(vid, s ? s.id : null);
    } else if (x.dataset.twx === "known") {
      const uv = Store.db.userVocab[t.w] || (Store.db.userVocab[t.w] = { known: false, firstSeenAt: null, lastSeenAt: null, encounterCount: 0 });
      uv.known = !uv.known;
      Store.persist();
      render();
    }
  });
  // Änderungen in den Wortdetails (Merkliste, bekannt) sofort zeigen
  document.addEventListener("wordstatus", () => { if (currentView === "top") renderBody(); });

  return { load, summary, render };
})();
