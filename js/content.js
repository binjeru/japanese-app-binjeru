"use strict";
// Inhalte: bereitet STORIES und DICT auf (Sätze mit IDs, Wortvorkommen, Häufigkeiten).
// Reine Lesesicht – speichert nichts.

const Content = (() => {
  const NOT_LEARNABLE = new Set(["Partikel", "Satzendpartikel", "Kopula", "Name"]);
  const PUNCT_ROMAJI = { "。": ".", "、": ",", "！": "!", "？": "?", "「": "“", "」": "”" };

  const vocabIdOf = key => (DICT[key] ? DICT[key].base || key : null);
  const vocab = id => DICT[id];
  const display = id => DICT[id].k || id;           // Schreibweise auf Karten
  const reading = id => DICT[id].r;
  const isLearnable = id => !NOT_LEARNABLE.has(DICT[id].pos);
  const sayText = key => DICT[key].say || DICT[key].r;

  const sentences = {};       // id → Sentence
  const storiesById = {};
  const globalFreq = {};      // vocabId → Vorkommen in allen Geschichten

  for (const story of STORIES) {
    storiesById[story.id] = story;
    story.flat = [];
    story.freq = {};
    story.firstSentence = {};
    story.scenes.forEach((scene, si) => {
      scene.index = si;
      scene.sentences = scene.sentences.map((raw, k) => {
        const tokens = raw.jp.split("|");
        let pos = 0;
        const offsets = tokens.map(t => { const o = pos; pos += t.length; return o; });
        const vocabIds = tokens.map(vocabIdOf);
        const s = {
          id: `${story.id}/${si + 1}/${k + 1}`, storyId: story.id, sceneIndex: si, indexInScene: k,
          flatIndex: story.flat.length, tokens, offsets, vocabIds, text: tokens.join(""), de: raw.de,
        };
        for (const [ti, t] of tokens.entries()) {
          if (!DICT[t]) {
            if (!/^[。、「」！？…\s]+$/.test(t)) console.warn(`Wort fehlt im DICT: „${t}“ (${s.id})`);
            continue;
          }
          const vid = vocabIds[ti];
          if (!DICT[vid]) { console.warn(`Grundform fehlt im DICT: „${vid}“`); continue; }
          story.freq[vid] = (story.freq[vid] || 0) + 1;
          globalFreq[vid] = (globalFreq[vid] || 0) + 1;
          if (!story.firstSentence[vid]) story.firstSentence[vid] = s.id;
        }
        sentences[s.id] = s;
        story.flat.push(s);
        return s;
      });
    });
  }

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
    return Object.keys(story.freq).filter(isLearnable).sort((a, b) => story.freq[b] - story.freq[a]);
  }

  // Erster Beispielsatz zu einem Wort aus irgendeiner Geschichte
  function firstSentenceAny(vid) {
    for (const story of STORIES) if (story.firstSentence[vid]) return sentences[story.firstSentence[vid]];
    return null;
  }

  return {
    stories: STORIES, story: id => storiesById[id], sentence: id => sentences[id],
    vocab, vocabIdOf, display, reading, isLearnable, sayText, globalFreq,
    romajiLine, sentenceHtml, storyVocab, firstSentenceAny,
  };
})();
