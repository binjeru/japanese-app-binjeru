"use strict";
// Inhalte: lädt Geschichten bei Bedarf (data/stories/<id>.js) und bereitet sie auf
// (Sätze mit IDs, Wortvorkommen, Häufigkeiten). Reine Lesesicht – speichert keinen Lernstand.

const Content = (() => {
  const NOT_LEARNABLE = new Set(["Partikel", "Satzendpartikel", "Kopula", "Name"]);
  const PUNCT_ROMAJI = { "。": ".", "、": ",", "！": "!", "？": "?", "「": "“", "」": "”" };
  const PUNCT = /^[。、「」！？…―\s]+$/;

  const vocabIdOf = key => (DICT[key] ? DICT[key].base || key : null);
  const vocab = id => DICT[id];
  const display = id => DICT[id].k || id;           // Schreibweise auf Karten
  const reading = id => DICT[id].r;
  const isLearnable = id => !NOT_LEARNABLE.has(DICT[id].pos);
  const sayText = key => DICT[key].say || DICT[key].r;
  // Häufigkeitsrang im Japanischen (null = nicht in der Liste)
  const rank = id => (typeof FREQ_RANK !== "undefined" && FREQ_RANK[id]) || null;
  const byRank = (a, b) => (rank(a) || Infinity) - (rank(b) || Infinity);

  const catalog = STORY_CATALOG;
  const meta = id => catalog.find(m => m.id === id) || null;
  const sentences = {};       // id → Sentence
  const storiesById = {};     // nur geladene Geschichten
  const globalFreq = {};      // vocabId → Vorkommen in allen geladenen Geschichten
  const loading = {};         // id → Promise
  const waiting = {};         // id → resolve

  // Wörterbucheinträge einer Geschichte ergänzen (vorhandene Einträge haben Vorrang)
  function addDict(entries) {
    const added = Object.keys(entries || {}).filter(k => !DICT[k]);
    for (const k of added) DICT[k] = entries[k];
    for (const k of added) { const w = DICT[k]; if (!w.r && !(w.de === undefined && w.base)) w.r = k; }
    for (const k of added) {
      const w = DICT[k];
      if (!w.base) continue;
      if (!DICT[w.base]) { console.warn(`Grundform fehlt im DICT: „${w.base}“`); continue; }
      if (!w.r) w.r = DICT[w.base].r;
      if (w.de === undefined) w.de = DICT[w.base].de;
    }
  }

  // Wird von jeder Geschichtsdatei aufgerufen
  function register(raw) {
    addDict(raw.dict);
    const story = { ...meta(raw.id), ...raw, dictKeys: Object.keys(raw.dict || {}), flat: [], freq: {}, firstSentence: {} };
    story.scenes = raw.scenes.map((scene, si) => ({
      title: scene.title, index: si,
      sentences: scene.sentences.map((r, k) => {
        const tokens = r.jp.split("|");
        let pos = 0;
        const offsets = tokens.map(t => { const o = pos; pos += t.length; return o; });
        const vocabIds = tokens.map(vocabIdOf);
        const s = {
          id: `${story.id}/${si + 1}/${k + 1}`, storyId: story.id, sceneIndex: si, indexInScene: k,
          flatIndex: story.flat.length, tokens, offsets, vocabIds, text: tokens.join(""), de: r.de,
        };
        for (const [ti, t] of tokens.entries()) {
          if (!DICT[t]) { if (!PUNCT.test(t)) console.warn(`Wort fehlt im DICT: „${t}“ (${s.id})`); continue; }
          const vid = vocabIds[ti];
          if (!DICT[vid]) { console.warn(`Grundform fehlt im DICT: „${vid}“`); continue; }
          story.freq[vid] = (story.freq[vid] || 0) + 1;
          globalFreq[vid] = (globalFreq[vid] || 0) + 1;
          if (!story.firstSentence[vid]) story.firstSentence[vid] = s.id;
        }
        sentences[s.id] = s;
        story.flat.push(s);
        return s;
      }),
    }));
    storiesById[story.id] = story;
    if (waiting[story.id]) { waiting[story.id](story); delete waiting[story.id]; }
    return story;
  }

  // Eigene Geschichten (aus dem privaten Daten-Repo, siehe own-stories.js): Katalogeintrag und Inhalt
  // liegen schon vor. Eingebaute Geschichten mit derselben ID haben Vorrang.
  const ownData = {};
  function addOwn(m, story) {
    const i = catalog.findIndex(x => x.id === m.id);
    if (i >= 0 && !catalog[i].own) return false;
    const entry = { ...m, sourceType: "own", own: true };
    if (i >= 0) catalog[i] = entry; else catalog.push(entry);
    ownData[m.id] = story;
    if (storiesById[m.id]) register(story);   // schon geladen → aktualisieren
    return true;
  }
  function removeOwn(id) {
    const i = catalog.findIndex(x => x.id === id && x.own);
    if (i >= 0) catalog.splice(i, 1);
    delete ownData[id];
    delete storiesById[id];
  }

  // Geschichte nachladen (per <script>, funktioniert auch ohne Server)
  function load(id) {
    if (storiesById[id]) return Promise.resolve(storiesById[id]);
    if (!meta(id)) return Promise.reject(new Error(`Unbekannte Geschichte: ${id}`));
    if (ownData[id]) return Promise.resolve(register(ownData[id]));
    if (!loading[id]) {
      loading[id] = new Promise((resolve, reject) => {
        waiting[id] = resolve;
        const el = document.createElement("script");
        el.src = `data/stories/${id}.js`;
        el.onerror = () => { delete loading[id]; delete waiting[id]; reject(new Error(`data/stories/${id}.js nicht gefunden`)); };
        document.head.appendChild(el);
      });
    }
    return loading[id];
  }
  const ensure = ids => Promise.all([...new Set(ids.filter(id => meta(id)))].map(id => load(id).catch(e => console.warn(e.message))));
  const loadAll = () => ensure(catalog.map(m => m.id));
  const storyIdOf = sentenceId => (sentenceId ? sentenceId.split("/")[0] : null);

  function romajiLine(tokens) {
    const line = tokens.map(t => {
      if (!DICT[t]) return PUNCT_ROMAJI[t] || t;
      return DICT[t].ro || kanaToRomaji(DICT[t].r);
    }).join(" ").replace(/ ([.,!?”])/g, "$1").replace(/“ /g, "“");
    return line.charAt(0).toUpperCase() + line.slice(1);
  }

  // Satz als HTML; Wörter antippbar. opts: { highlight: vocabId, furigana: bool, statusOf: fn }
  function sentenceHtml(s, opts = {}) {
    return s.tokens.map((t, ti) => {
      const w = DICT[t];
      if (!w) return `<span class="punct">${escapeHtml(t)}</span>`;
      const vid = s.vocabIds[ti];
      const cls = ["tok"];
      if (opts.highlight && vid === opts.highlight) cls.push("target");
      if (opts.statusOf && isLearnable(vid)) cls.push(`st-${opts.statusOf(vid)}`);
      const inner = opts.furigana === false ? escapeHtml(t) : furiganaHtml(t, w.r);
      return `<span class="${cls.join(" ")}" data-k="${escapeHtml(t)}" data-sid="${s.id}" data-ti="${ti}"${opts.tabbable ? ' tabindex="0"' : ""}>${inner}</span>`;
    }).join("");
  }

  // Wörter einer Geschichte, nach Häufigkeit sortiert (für Wortschatz-Check und Vorschläge)
  function storyVocab(storyId) {
    const story = storiesById[storyId];
    return story ? Object.keys(story.freq).filter(isLearnable).sort((a, b) => story.freq[b] - story.freq[a]) : [];
  }

  // Wie viel einer Geschichte ist schon verständlich? Anteil der Wortvorkommen (ohne Partikel,
  // Namen, Satzzeichen), deren Wort bekannt ist oder in der Lernkartei liegt.
  function coverage(storyId, statusOf) {
    const story = storiesById[storyId];
    if (!story) return null;
    let total = 0, known = 0;
    const unknownWords = new Set();
    for (const [vid, n] of Object.entries(story.freq)) {
      if (!isLearnable(vid)) continue;
      total += n;
      const st = statusOf(vid);
      if (st === "known" || st === "active") known += n;
      else unknownWords.add(vid);
    }
    return { pct: total ? Math.round((known / total) * 100) : 100, unknownWords: unknownWords.size, words: Object.keys(story.freq).filter(isLearnable).length };
  }

  // Erster Beispielsatz zu einem Wort aus irgendeiner geladenen Geschichte
  function firstSentenceAny(vid) {
    for (const m of catalog) {
      const story = storiesById[m.id];
      if (story && story.firstSentence[vid]) return sentences[story.firstSentence[vid]];
    }
    return null;
  }

  return {
    catalog, meta, register, load, ensure, loadAll, storyIdOf, addOwn, removeOwn,
    get stories() { return catalog.map(m => storiesById[m.id]).filter(Boolean); },
    story: id => storiesById[id] || null, sentence: id => sentences[id] || null,
    vocab, vocabIdOf, display, reading, isLearnable, sayText, globalFreq, rank, byRank,
    romajiLine, sentenceHtml, storyVocab, coverage, firstSentenceAny,
  };
})();
