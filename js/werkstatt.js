"use strict";
// Werkstatt: japanischen Text in eine Binjeru-Geschichte umwandeln.
// Wortzerlegung mit kuromoji.js, Wiederverwendung des vorhandenen Wörterbuchs, Prüfen/Bearbeiten, Export.
// Der Entwurf wird im Browser gespeichert (localStorage), damit nichts verloren geht.

const Werkstatt = (() => {
  const SAVE_KEY = "binjeru-werkstatt";
  const DIC_PATH = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/";
  const PUNCT = /^[。、「」『』（）()！？!?…―・\s　]+$/;
  const META = ["id", "titleJp", "titleDe", "level", "genre", "icon", "description", "source"];
  const POS_MAP = { "名詞": "Nomen", "動詞": "Verb", "形容詞": "Adjektiv", "副詞": "Adverb", "助詞": "Partikel",
    "助動詞": "Hilfsverb", "感動詞": "Ausruf", "連体詞": "Demonstrativ", "接続詞": "Konjunktion", "フィラー": "Ausruf" };
  const POS_CHOICES = ["Nomen", "Verb", "Adjektiv", "Adjektiv (na)", "Adverb", "Partikel", "Satzendpartikel", "Kopula", "Hilfsverb",
    "Pronomen", "Demonstrativ", "Fragewort", "Zahlwort", "Konjunktion", "Ausruf", "Ausdruck", "Lautmalerei", "Suffix", "Name"];

  let tokenizer = null;
  let draft = null; // { meta, scenes: [{ title, sentences: [{ segs: [key], de }] }], dict: { key: entry } }
  let sel = null;   // { si, ki, ti } – Szene, Satz, Wort
  const kIndex = {}; // Kanji-Schreibweise → vorhandener Schlüssel (z. B. 猫 → ねこ)

  const $id = id => document.getElementById(id);
  const isPunct = k => PUNCT.test(k);
  const entryOf = k => (draft && draft.dict[k]) || DICT[k] || null;
  const isOwn = k => !!(draft && draft.dict[k]);
  // Bedeutung vorhanden (direkt oder über die Grundform)?
  function hasMeaning(k) {
    const e = entryOf(k);
    if (!e) return false;
    if (e.de) return true;
    return !!(e.base && entryOf(e.base) && entryOf(e.base).de);
  }
  // Doppelte Begriffe aus JMdict-Bedeutungen entfernen („alter Mann, Greis, alter Mann“ → „alter Mann, Greis“)
  function tidyGloss(g) {
    const seen = new Set();
    return g.split("; ").map(sense => sense.split(", ").filter(x => {
      const k = x.trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    }).join(", ")).filter(Boolean).join("; ");
  }
  const lookupDe = (word, reading) => {
    if (typeof JMDICT_DE === "undefined") return "";
    const g = JMDICT_DE[word] || (reading && reading !== word && !isKanji(word) ? JMDICT_DE[reading] : "") || "";
    return g ? tidyGloss(g) : "";
  };

  // ---------- Speichern ----------
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(draft)); } catch { /* voll/privat */ } }, 300);
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
  }

  // ---------- Text in Szenen und Sätze teilen ----------
  function splitSentences(line) {
    const out = [];
    let buf = "";
    for (let i = 0; i < line.length; i++) {
      buf += line[i];
      if ("。！？!?".includes(line[i])) {
        while (i + 1 < line.length && "」』）)".includes(line[i + 1])) buf += line[++i];
        out.push(buf);
        buf = "";
      }
    }
    if (buf.trim()) out.push(buf);
    return out;
  }
  function splitText(text) {
    const clean = text.replace(/《[^》]*》/g, "").replace(/[｜]/g, "").replace(/\r/g, "");
    const scenes = [];
    let cur = null;
    for (const raw of clean.split("\n")) {
      const line = raw.replace(/^[ \t　]+/, "").replace(/\s+$/, "");
      if (line.startsWith("#")) { cur = { title: line.replace(/^#+\s*/, ""), sentences: [] }; scenes.push(cur); continue; }
      if (!line) continue;
      if (!cur) { cur = { title: "Szene 1", sentences: [] }; scenes.push(cur); }
      cur.sentences.push(...splitSentences(line));
    }
    return scenes.filter(s => s.sentences.length);
  }

  // ---------- Wortzerlegung ----------
  const readingOf = t => (t.reading && t.reading !== "*" ? kataToHira(t.reading) : t.surface_form);
  function posDe(t) {
    if (t.pos === "名詞") {
      if (t.pos_detail_1 === "固有名詞") return "Name";
      if (t.pos_detail_1 === "代名詞") return "Pronomen";
      if (t.pos_detail_1 === "形容動詞語幹") return "Adjektiv (na)";
      if (t.pos_detail_1 === "数") return "Zahlwort";
      return "Nomen";
    }
    if (t.pos === "助動詞" && ["だ", "です"].includes(t.basic_form)) return "Kopula";
    if (t.pos === "助詞" && t.pos_detail_1 === "終助詞") return "Satzendpartikel";
    return POS_MAP[t.pos] || "";
  }

  // kuromoji-Token zu lernfreundlichen Einheiten zusammenfassen: Verb/Adjektiv + Hilfsverben (ます, た, ない …)
  // + て/で bilden ein Wort mit der Grundform des Verbs; Präfixe (お, ご) kommen ans folgende Nomen.
  function segment(text) {
    const segs = [];
    let prefix = null;
    for (const t of tokenizer.tokenize(text)) {
      const s = t.surface_form;
      if (t.pos === "記号" || isPunct(s)) { segs.push({ s, punct: true }); continue; }
      const r = readingOf(t);
      if (t.pos === "接頭詞") { prefix = prefix ? { s: prefix.s + s, r: prefix.r + r } : { s, r }; continue; }
      const prev = segs[segs.length - 1];
      const chain = prev && !prev.punct && prev.open;
      const attach = chain && (
        (t.pos === "助動詞" && t.basic_form !== "です" && (t.basic_form !== "だ" || /[んい]$/.test(prev.s))) ||
        (t.pos === "助詞" && t.pos_detail_1 === "接続助詞" && ["て", "で", "ちゃ", "じゃ"].includes(s)) ||
        ((t.pos === "動詞" || t.pos === "形容詞") && t.pos_detail_1 === "接尾")
      );
      if (attach) {
        prev.s += s;
        prev.r += r;
        if (t.pos === "助詞") prev.open = false;
        continue;
      }
      const seg = { s, r, base: t.basic_form && t.basic_form !== "*" ? t.basic_form : s, pos: posDe(t), open: ["動詞", "形容詞", "助動詞"].includes(t.pos) };
      if (seg.base !== s && t.pos !== "動詞" && t.pos !== "形容詞" && t.pos !== "助動詞") seg.base = s;
      if (prefix) { seg.s = prefix.s + seg.s; seg.r = prefix.r + seg.r; seg.base = seg.s; prefix = null; }
      if (rubyHints[seg.s]) seg.r = rubyHints[seg.s];
      segs.push(seg);
    }
    if (prefix) segs.push({ s: prefix.s, r: prefix.r, base: prefix.s, pos: "Präfix" });
    return mergeKnown(segs);
  }

  // Nebeneinanderliegende Teile zusammenfassen, wenn es den Ausdruck schon im Wörterbuch gibt
  // (z. B. ある|日 → ある日, むかし|むかし → むかしむかし)
  function mergeKnown(segs) {
    const out = [];
    for (let i = 0; i < segs.length; i++) {
      let done = false;
      for (let n = Math.min(4, segs.length - i); n >= 2 && !done; n--) {
        const part = segs.slice(i, i + n);
        if (part.some(x => x.punct)) continue;
        const key = part.map(x => x.s).join("");
        if (entryOf(key)) { out.push({ s: key, known: true }); i += n - 1; done = true; }
      }
      if (!done) out.push(segs[i]);
    }
    return out;
  }

  // Lesungen aus Aozora-Ruby (漢字《かんじ》) als Vorgabe merken
  let rubyHints = {};
  function collectRuby(text) {
    rubyHints = {};
    for (const m of text.matchAll(/([㐀-鿿々〆ヶ]+)《([^》]+)》/g)) rubyHints[m[1]] = m[2];
  }

  // Lesung eines beliebigen Ausdrucks über kuromoji
  const readingFor = text => tokenizer.tokenize(text).map(readingOf).join("");
  // Vorhandenen Eintrag für eine Grundform finden (auch über die Kanji-Schreibweise, z. B. 行く → いく)
  const existingBase = base => (DICT[base] ? base : kIndex[base] || (draft.dict[base] ? base : null));

  // Wörterbucheintrag für ein neues Wort anlegen
  function ensureEntry(key, info = null) {
    if (isPunct(key) || entryOf(key)) return;
    if (!info) {
      const parts = segment(key).filter(x => !x.punct);
      info = parts.length === 1 ? parts[0] : { s: key, r: readingFor(key), base: key, pos: parts[0] ? parts[0].pos : "" };
    }
    const e = {};
    if (isKanji(key) && info.r && info.r !== key) e.r = info.r;
    const base = info.base && info.base !== key ? info.base : null;
    if (base) {
      let bkey = existingBase(base);
      if (!bkey) {
        const br = readingFor(base);
        const be = { de: lookupDe(base, br), pos: info.pos };
        if (isKanji(base) && br !== base) be.r = br;
        draft.dict[base] = be;
        bkey = base;
      }
      e.base = bkey;
      e.de = ""; // leer = Bedeutung der Grundform; für die Form ergänzbar (z. B. „ging (höflich)“)
    } else {
      e.de = lookupDe(key, info.r);
      e.pos = info.pos;
    }
    if (!isKanji(key) && e.r) delete e.r;
    draft.dict[key] = e;
  }

  function analyze() {
    const text = $id("w-text").value;
    const scenes = splitText(text);
    if (!scenes.length) { toast("Bitte zuerst einen Text einfügen."); return; }
    if (draft && draft.scenes.length && !confirm("Den bisherigen Entwurf (Übersetzungen, Änderungen) durch eine neue Zerlegung ersetzen?")) return;
    collectRuby(text);
    draft = { meta: readMeta(), text, scenes: [], dict: {} };
    for (const sc of scenes) {
      draft.scenes.push({
        title: sc.title,
        sentences: sc.sentences.map(t => {
          const segs = segment(t);
          for (const sg of segs) if (!sg.punct) ensureEntry(sg.s, sg);
          return { segs: segs.map(sg => sg.s), de: "" };
        }),
      });
    }
    sel = null;
    save();
    render();
    toast(`${draft.scenes.reduce((n, s) => n + s.sentences.length, 0)} Sätze zerlegt`);
  }

  // ---------- Bearbeiten ----------
  const sentence = () => draft.scenes[sel.si].sentences[sel.ki];
  function readMeta() {
    const m = {};
    for (const k of META) m[k] = $id(`m-${k}`).value.trim();
    return m;
  }
  function usedKeys() {
    const used = new Set();
    for (const sc of draft.scenes) for (const s of sc.sentences) for (const k of s.segs) used.add(k);
    for (const k of [...used]) { const e = entryOf(k); if (e && e.base) used.add(e.base); }
    return used;
  }
  function prune() {
    const used = usedKeys();
    for (const k of Object.keys(draft.dict)) if (!used.has(k)) delete draft.dict[k];
  }

  function mergeWith(dir) {
    const s = sentence();
    const a = dir < 0 ? sel.ti - 1 : sel.ti, b = a + 1;
    if (a < 0 || b >= s.segs.length || isPunct(s.segs[a]) || isPunct(s.segs[b])) { toast("Hier lässt sich nichts verbinden."); return; }
    const key = s.segs[a] + s.segs[b];
    s.segs.splice(a, 2, key);
    ensureEntry(key);
    sel.ti = a;
    afterEdit();
  }
  function splitWord() {
    const s = sentence();
    const key = s.segs[sel.ti];
    const at = Number(prompt(`Nach wie vielen Zeichen teilen? („${key}“ hat ${[...key].length})`, "1"));
    const chars = [...key];
    if (!(at > 0 && at < chars.length)) return;
    const a = chars.slice(0, at).join(""), b = chars.slice(at).join("");
    s.segs.splice(sel.ti, 1, a, b);
    ensureEntry(a);
    ensureEntry(b);
    afterEdit();
  }
  function splitSentenceHere() {
    const sc = draft.scenes[sel.si];
    const s = sentence();
    if (sel.ti >= s.segs.length - 1) { toast("Das ist schon das Satzende."); return; }
    const rest = { segs: s.segs.splice(sel.ti + 1), de: "" };
    sc.sentences.splice(sel.ki + 1, 0, rest);
    toast("Satz geteilt – bitte beide Übersetzungen prüfen.");
    afterEdit();
  }
  function joinWithNextSentence(si, ki) {
    const sc = draft.scenes[si];
    if (ki + 1 >= sc.sentences.length) return;
    const [next] = sc.sentences.splice(ki + 1, 1);
    sc.sentences[ki].segs.push(...next.segs);
    sc.sentences[ki].de = [sc.sentences[ki].de, next.de].filter(Boolean).join(" ");
    sel = null;
    afterEdit();
  }
  function renameKey(oldKey, newKey) {
    if (!newKey || newKey === oldKey) return;
    for (const sc of draft.scenes) for (const s of sc.sentences) s.segs = s.segs.map(k => (k === oldKey ? newKey : k));
    if (!entryOf(newKey)) { draft.dict[newKey] = draft.dict[oldKey]; }
    for (const e of Object.values(draft.dict)) if (e.base === oldKey) e.base = newKey;
    afterEdit();
  }
  function afterEdit() {
    prune();
    save();
    render();
  }

  // ---------- Darstellung ----------
  function stats() {
    let sentences = 0, noDe = 0, words = 0;
    const missing = new Set();
    for (const sc of draft.scenes) for (const s of sc.sentences) {
      sentences++;
      if (!s.de.trim()) noDe++;
      for (const k of s.segs) if (!isPunct(k)) { words++; if (!hasMeaning(k)) missing.add(k); }
    }
    const own = Object.keys(draft.dict).length;
    return { sentences, noDe, words, missing: missing.size, own };
  }

  function render() {
    $id("w-review").classList.toggle("hidden", !draft);
    $id("w-export").classList.toggle("hidden", !draft);
    if (!draft) { $id("w-insp").classList.add("hidden"); return; }
    renderStats();
    $id("w-scenes").innerHTML = renderScenes();
    renderInspector();
  }

  function renderStats() {
    const st = stats();
    $id("w-stats").innerHTML = `
      <span>${draft.scenes.length} Szenen · ${st.sentences} Sätze · ${st.words} Wörter · ${st.own} neue Einträge</span>
      <span class="${st.missing ? "bad" : "ok"}">${st.missing ? `${st.missing} Bedeutungen fehlen` : "✓ alle Bedeutungen da"}</span>
      <span class="${st.noDe ? "bad" : "ok"}">${st.noDe ? `${st.noDe} Übersetzungen fehlen` : "✓ alle Sätze übersetzt"}</span>`;
  }

  function renderScenes() {
    return draft.scenes.map((sc, si) => `
      <div class="w-scene">
        <div class="w-scene-head"><b>Szene ${si + 1}</b><input class="text-input" data-scene-title="${si}" value="${escapeHtml(sc.title)}"></div>
        ${sc.sentences.map((s, ki) => `
          <div class="w-sent">
            <span class="w-num">${ki + 1}</span>
            <div class="w-toks">${s.segs.map((k, ti) => {
              if (isPunct(k)) return `<span class="chip-w punct">${escapeHtml(k)}</span>`;
              const cls = ["chip-w"];
              if (isOwn(k)) cls.push("new");
              if (!hasMeaning(k)) cls.push("missing");
              if (sel && sel.si === si && sel.ki === ki && sel.ti === ti) cls.push("sel");
              const e = entryOf(k);
              return `<button class="${cls.join(" ")}" data-w="${si}/${ki}/${ti}" title="${escapeHtml(e && e.r ? e.r : "")}">${escapeHtml(k)}</button>`;
            }).join("")}
            ${ki + 1 < sc.sentences.length ? `<button class="link" data-join="${si}/${ki}" title="Mit dem nächsten Satz verbinden">⤵</button>` : ""}</div>
            <textarea class="text-input w-de ${s.de.trim() ? "" : "missing"}" rows="1" data-de="${si}/${ki}" placeholder="Deutsche Übersetzung …">${escapeHtml(s.de)}</textarea>
          </div>`).join("")}
      </div>`).join("");
  }

  function renderInspector() {
    const el = $id("w-insp");
    if (!sel) { el.classList.add("hidden"); return; }
    const key = sentence().segs[sel.ti];
    const e = entryOf(key);
    const own = isOwn(key);
    const base = e && e.base ? e.base : null;
    const be = base ? entryOf(base) : null;
    el.classList.remove("hidden");
    el.innerHTML = `
      <h3><span class="badge ${own ? "new" : "old"}">${own ? "neu" : "vorhanden"}</span> Wort</h3>
      <div class="big">${furiganaHtml(key, e && e.r ? e.r : key)}</div>
      ${own ? `
        <label>Schreibweise im Text<input class="text-input" id="i-key" value="${escapeHtml(key)}"></label>
        <label>Lesung (Hiragana)<input class="text-input" id="i-r" value="${escapeHtml(e.r || "")}" placeholder="${isKanji(key) ? "fehlt!" : "wie Schreibweise"}"></label>
        <label>Grundform (leer = ist selbst Grundform)<input class="text-input" id="i-base" value="${escapeHtml(e.base || "")}"></label>
        <label>Bedeutung${base ? " dieser Form (optional)" : ""}<input class="text-input" id="i-de" value="${escapeHtml(e.de || "")}" placeholder="${base ? "leer = Bedeutung der Grundform" : "z. B. Fuchs"}"></label>
        ${!base && lookupDe(key, e.r) && lookupDe(key, e.r) !== e.de ? `<p class="hint">JMdict: ${escapeHtml(lookupDe(key, e.r))} <button class="link" id="i-jm">übernehmen</button></p>` : ""}
        ${!base ? `<label>Wortart<select id="i-pos"><option value=""></option>${POS_CHOICES.map(p => `<option ${e.pos === p ? "selected" : ""}>${p}</option>`).join("")}</select></label>` : ""}
        <label>Hinweis (optional)<input class="text-input" id="i-note" value="${escapeHtml(e.note || "")}" placeholder="z. B. 〜ている = Verlauf"></label>
        <div class="row"><button class="primary" id="i-save">Übernehmen</button></div>`
      : `<p class="hint">${escapeHtml(e ? e.de || (be && be.de) || "" : "")}${e && e.pos ? ` · ${escapeHtml(e.pos)}` : ""}<br>Steht schon im Wörterbuch und wird wiederverwendet.</p>`}
      ${base ? `
        <h3 style="margin-top:14px"><span class="badge ${isOwn(base) ? "new" : "old"}">${isOwn(base) ? "neu" : "vorhanden"}</span> Grundform ${escapeHtml(base)}</h3>
        ${isOwn(base) ? `
          <label>Lesung<input class="text-input" id="b-r" value="${escapeHtml(be.r || "")}"></label>
          <label>Bedeutung<input class="text-input" id="b-de" value="${escapeHtml(be.de || "")}" placeholder="z. B. gehen"></label>
          ${lookupDe(base, be.r) && lookupDe(base, be.r) !== be.de ? `<p class="hint">JMdict: ${escapeHtml(lookupDe(base, be.r))} <button class="link" id="b-jm">übernehmen</button></p>` : ""}
          <label>Wortart<select id="b-pos"><option value=""></option>${POS_CHOICES.map(p => `<option ${be.pos === p ? "selected" : ""}>${p}</option>`).join("")}</select></label>
          <label>Kanji-Schreibweise für die Karte (optional)<input class="text-input" id="b-k" value="${escapeHtml(be.k || "")}"></label>
          <div class="row"><button class="primary" id="b-save">Grundform übernehmen</button></div>`
        : `<p class="hint">${escapeHtml(be ? be.de : "fehlt")}</p>`}` : ""}
      <h3 style="margin-top:14px">Zerlegung</h3>
      <div class="row">
        <button class="secondary" id="i-merge-prev">← verbinden</button>
        <button class="secondary" id="i-merge-next">verbinden →</button>
        <button class="secondary" id="i-split">Wort teilen</button>
        <button class="secondary" id="i-split-sent">Satz hier teilen</button>
      </div>`;
  }

  function saveInspector() {
    const key = sentence().segs[sel.ti];
    const e = draft.dict[key];
    const v = id => ($id(id) ? $id(id).value.trim() : "");
    const newKey = v("i-key");
    const r = v("i-r"), base = v("i-base"), de = v("i-de"), note = v("i-note");
    if (r && r !== newKey) e.r = r; else delete e.r;
    if (note) e.note = note; else delete e.note;
    if (base && base !== newKey) {
      e.base = base;
      e.de = de;
      delete e.pos;
      if (!entryOf(base)) { const br = readingFor(base); draft.dict[base] = { de: lookupDe(base, br), pos: "", ...(isKanji(base) && br !== base ? { r: br } : {}) }; }
    } else {
      delete e.base;
      e.de = de;
      e.pos = $id("i-pos") ? $id("i-pos").value : e.pos || "";
    }
    if (newKey !== key) renameKey(key, newKey);
    else afterEdit();
    toast("Übernommen");
  }
  function saveBase() {
    const key = sentence().segs[sel.ti];
    const bkey = entryOf(key).base;
    const be = draft.dict[bkey];
    const v = id => $id(id).value.trim();
    if (v("b-r") && v("b-r") !== bkey) be.r = v("b-r"); else delete be.r;
    be.de = v("b-de");
    be.pos = $id("b-pos").value;
    if (v("b-k")) be.k = v("b-k"); else delete be.k;
    afterEdit();
    toast("Grundform übernommen");
  }

  // ---------- Export ----------
  const js = v => JSON.stringify(v);
  function entryCode(e) {
    const order = ["r", "ro", "de", "k", "base", "pos", "note", "say"];
    const parts = order.filter(f => e[f] !== undefined && e[f] !== "" && !(f === "de" && e.base && !e.de)).map(f => `${f}: ${js(e[f])}`);
    return `{ ${parts.join(", ")} }`;
  }
  function build() {
    draft.meta = readMeta();
    const m = draft.meta;
    if (!/^[a-z0-9-]+$/.test(m.id)) { toast("Bitte eine ID aus Kleinbuchstaben/Ziffern eintragen."); $id("m-id").focus(); return; }
    if (Content.meta(m.id)) toast(`Hinweis: Die ID „${m.id}“ gibt es schon – die bestehende Geschichte würde ersetzt.`);
    prune();
    const st = stats();
    const scenes = draft.scenes.map(sc => `    {
      title: ${js(sc.title)},
      sentences: [
${sc.sentences.map(s => `        { jp: ${js(s.segs.join("|"))}, de: ${js(s.de.trim())} },`).join("\n")}
      ],
    },`).join("\n");
    const dict = Object.keys(draft.dict).sort().map(k => `    ${js(k)}: ${entryCode(draft.dict[k])},`).join("\n");
    const file = `// ${m.titleJp} – ${m.titleDe}
// Quelle: ${m.source || "–"}. Mit der Binjeru-Werkstatt aufbereitet (Wortzerlegung: kuromoji.js).
${st.missing || st.noDe ? `// Offen: ${st.missing} Bedeutungen, ${st.noDe} Übersetzungen fehlen noch.\n` : ""}Content.register({
  id: ${js(m.id)}, audioUri: null,
  scenes: [
${scenes}
  ],
  dict: {
${dict}
  },
});
`;
    const catalog = `  {
    id: ${js(m.id)}, titleJp: ${js(m.titleJp)}, titleDe: ${js(m.titleDe)},
    description: ${js(m.description)},
    level: ${js(m.level)}, genre: ${js(m.genre)}, icon: ${js(m.icon || "話")}, sourceType: "curated", source: ${js(m.source)},
  },`;
    $id("w-file").value = file;
    $id("w-catalog").value = catalog;
    $id("w-file-name").textContent = `data/stories/${m.id}.js`;
    $id("w-out").classList.remove("hidden");
    save();
    if (st.missing || st.noDe) toast(`Erzeugt – es fehlen noch ${st.missing} Bedeutungen und ${st.noDe} Übersetzungen.`);
  }

  // ---------- Ereignisse ----------
  document.addEventListener("click", e => {
    const w = e.target.closest("[data-w]");
    if (w) { const [si, ki, ti] = w.dataset.w.split("/").map(Number); sel = { si, ki, ti }; render(); return; }
    const j = e.target.closest("[data-join]");
    if (j) { const [si, ki] = j.dataset.join.split("/").map(Number); joinWithNextSentence(si, ki); return; }
    const c = e.target.closest("[data-copy]");
    if (c) { const ta = $id(c.dataset.copy); ta.select(); navigator.clipboard ? navigator.clipboard.writeText(ta.value).then(() => toast("Kopiert")) : (document.execCommand("copy"), toast("Kopiert")); return; }
    const id = e.target.id;
    if (id === "w-analyze") analyze();
    else if (id === "w-reset") { if (confirm("Entwurf wirklich verwerfen?")) { draft = null; sel = null; try { localStorage.removeItem(SAVE_KEY); } catch { /* egal */ } render(); } }
    else if (id === "w-build") build();
    else if (id === "w-download") {
      const blob = new Blob([$id("w-file").value], { type: "text/javascript" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${draft.meta.id || "geschichte"}.js`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    else if (id === "i-jm") { const e2 = entryOf(sentence().segs[sel.ti]); $id("i-de").value = lookupDe(sentence().segs[sel.ti], e2.r); }
    else if (id === "b-jm") { const b = entryOf(sentence().segs[sel.ti]).base; $id("b-de").value = lookupDe(b, entryOf(b).r); }
    else if (id === "i-save") saveInspector();
    else if (id === "b-save") saveBase();
    else if (id === "i-merge-prev") mergeWith(-1);
    else if (id === "i-merge-next") mergeWith(1);
    else if (id === "i-split") splitWord();
    else if (id === "i-split-sent") splitSentenceHere();
  });
  document.addEventListener("input", e => {
    if (!draft) return;
    const d = e.target.dataset;
    if (d.de) { const [si, ki] = d.de.split("/").map(Number); draft.scenes[si].sentences[ki].de = e.target.value; e.target.classList.toggle("missing", !e.target.value.trim()); renderStats(); save(); }
    else if (d.sceneTitle) { draft.scenes[Number(d.sceneTitle)].title = e.target.value; save(); }
    else if (e.target.id && e.target.id.startsWith("m-")) { draft.meta = readMeta(); save(); }
  });
  // Übersetzungsfelder wachsen mit
  document.addEventListener("input", e => { if (e.target.matches(".w-de")) { e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; } });
  document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.closest("#w-insp input")) { e.preventDefault(); (document.getElementById("i-save") || document.getElementById("b-save")).click(); } });

  // ---------- Start ----------
  function init() {
    for (const [key, w] of Object.entries(DICT)) if (w.k && !kIndex[w.k]) kIndex[w.k] = key;
    draft = load();
    if (draft) {
      for (const k of META) $id(`m-${k}`).value = (draft.meta && draft.meta[k]) || "";
      $id("w-text").value = draft.text || "";
    }
    render();
    const status = $id("w-status");
    Content.loadAll().then(() => {
      for (const [key, w] of Object.entries(DICT)) if (w.k && !kIndex[w.k]) kIndex[w.k] = key;
      kuromoji.builder({ dicPath: DIC_PATH }).build((err, t) => {
        if (err) { status.innerHTML = `<span class="loading">Die Wortzerlegung konnte nicht geladen werden (Internetverbindung nötig): ${escapeHtml(String(err))}</span>`; return; }
        tokenizer = t;
        $id("w-analyze").disabled = false;
        status.textContent = `Bereit. Wörterbuch: ${Object.keys(DICT).length} Einträge aus ${Content.stories.length} Geschichten${typeof JMDICT_DE !== "undefined" ? " + deutsche Bedeutungen aus JMdict" : ""}.`;
        render();
      });
    });
  }
  init();

  return { get draft() { return draft; }, segment: t => segment(t), analyze };
})();
