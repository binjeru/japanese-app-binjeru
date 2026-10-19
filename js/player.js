"use strict";
// Geschichtenplayer: Wiedergabe Satz für Satz, Szenen, Hör-/Lesemodus, synchronisiertes Transkript

const Player = (() => {
  const RATE_BASE = 0.9;
  const root = $("#player");
  let P = null; // { story, idx, scene, playing, ended, run, started, peek }
  let modeSeg = null;
  const prefs = () => Store.db.prefs;
  function setMode(mode) { prefs().mode = mode; Store.persist(); modeSeg.set(mode); applyPrefs(); }

  // Sprachaufnahmen (falls vorhanden): ein Audio-Element für die Wiedergabe, eines lädt den nächsten Satz vor
  const audio = new Audio();
  const preload = new Audio();
  preload.preload = "auto";
  audio.preload = "auto";
  const hasAudio = () => !!(P && P.story.audio);

  function open(storyId, position) {
    // Wie bei der echten Lernkartei: erst die fälligen Karten, dann die Geschichte
    if (!Store.gateOpen()) {
      toast(`Zuerst die Tagesabfrage (${Store.dueQueue().length} fällig) – dann geht's mit der Geschichte weiter.`);
      showView("deck");
      return;
    }
    Content.load(storyId).then(story => openLoaded(story, position)).catch(e => toast(e.message));
  }

  function openLoaded(story, position) {
    const storyId = story.id;
    pause();
    let idx = position != null ? position : Store.progress(storyId).position;
    if (!(idx >= 0 && idx < story.flat.length)) idx = 0;
    P = { story, idx, scene: -1, playing: false, ended: false, run: 0, started: false, peek: false };
    renderShell();
    setCurrent(idx);
    showView("player");
    const li = $(`.sent[data-idx="${idx}"]`, root);
    if (li && idx > 0) li.scrollIntoView({ block: "center" });
  }

  function renderShell() {
    const s = P.story;
    root.innerHTML = `
      <div class="pl-head">
        <button class="secondary" data-act="back">← Bibliothek</button>
        ${s.audio ? `<span class="audio-badge rec" title="Sprachaufnahme, erzeugt mit VOICEVOX">🎙 ${escapeHtml(s.audio.credit)}</span>`
          : `<span class="audio-badge" title="Für diese Geschichte gibt es noch keine Audioaufnahme.">🔈 Sprachausgabe · Platzhalter</span>`}
      </div>
      <h2 class="pl-title">${levelBadge(s.level)} <span class="jp">${s.titleJp}</span> <small>${escapeHtml(s.titleDe)}</small></h2>
      <div class="scene-tabs" id="pl-scenes">${s.scenes.map((sc, i) =>
        `<button data-scene="${i}"><b>${i + 1}</b> ${escapeHtml(sc.title.split(" – ")[0])}</button>`).join("")}</div>
      <p class="hint voice-hint hidden" id="pl-voice"></p>
      <div id="pl-transcript" class="transcript"></div>
      <div id="pl-listen" class="listen-card"></div>
      <div class="pl-bar">
        <div class="pl-progress"><div id="pl-progress-fill"></div></div>
        <div class="pl-controls">
          <button data-act="prev" title="Vorheriger Satz (←)" aria-label="Vorheriger Satz">⏮</button>
          <button data-act="play" class="play" title="Abspielen / Pause (Leertaste)" aria-label="Abspielen">▶</button>
          <button data-act="next" title="Nächster Satz (→)" aria-label="Nächster Satz">⏭</button>
          <button data-act="repeat" title="Satz wiederholen (R)" aria-label="Satz wiederholen">↻</button>
          <span class="pl-pos" id="pl-pos"></span>
          <div class="segmented small" id="pl-speed">
            <button data-v="0.75">0,75×</button><button data-v="1">1×</button><button data-v="1.25">1,25×</button>
          </div>
        </div>
        <div class="pl-options">
          <div class="segmented small" id="pl-mode"><button data-v="listen">🎧 Hören</button><button data-v="read">📖 Lesen</button></div>
          <label title="Wörter, die in der Geschichte in Kana stehen, mit Kanji anzeigen (wie in der Lernkartei)"><input type="checkbox" data-pref="kanji"> 漢字</label>
          <label><input type="checkbox" data-pref="furi"> Furigana</label>
          <label><input type="checkbox" data-pref="romaji"> Romaji</label>
          <label><input type="checkbox" data-pref="de"> Deutsch</label>
        </div>
      </div>`;
    segmented($("#pl-speed", root), prefs().speed, v => { prefs().speed = v; Store.persist(); audio.playbackRate = Number(v); });
    modeSeg = segmented($("#pl-mode", root), prefs().mode, v => { prefs().mode = v; Store.persist(); applyPrefs(); });
    $$("[data-pref]", root).forEach(box => {
      box.checked = prefs()[box.dataset.pref];
      box.addEventListener("change", () => {
        prefs()[box.dataset.pref] = box.checked;
        Store.persist();
        if (box.dataset.pref === "kanji") { Content.setKanjiMode(box.checked); P.scene = -1; setCurrent(P.idx); }   // Text neu aufbauen
        applyPrefs();
      });
    });
    updateVoiceHint();
  }

  function applyPrefs() {
    const t = $("#pl-transcript", root);
    if (!t) return;
    const listen = prefs().mode === "listen";
    root.classList.toggle("no-furi", !prefs().furi);
    root.classList.toggle("show-ro", prefs().romaji);
    root.classList.toggle("show-de", prefs().de);
    t.classList.toggle("hidden", listen);
    $("#pl-listen", root).classList.toggle("hidden", !listen);
    if (listen) renderListenCard();
  }

  function updateVoiceHint() {
    const el = $("#pl-voice", root);
    if (!el) return;
    let msg = "";
    if (hasAudio()) msg = "";
    else if (!Speech.supported) msg = "Dein Browser unterstützt keine Sprachausgabe – du kannst die Geschichte aber lesen.";
    else if (!Speech.hasVoice) msg = "Keine japanische Stimme gefunden. In Edge und Chrome ist meist eine dabei; unter Windows sonst: Einstellungen → Zeit und Sprache → Sprache → Japanisch hinzufügen.";
    el.textContent = msg;
    el.classList.toggle("hidden", !msg);
  }
  Speech.onVoiceChange(updateVoiceHint);

  // Transkript der aktuellen Szene
  function renderScene() {
    const story = P.story;
    const scene = story.scenes[P.scene];
    const last = P.scene === story.scenes.length - 1;
    $("#pl-transcript", root).innerHTML = `
      <h3 class="scene-title">${escapeHtml(scene.title)}</h3>
      <ol class="sents">${scene.sentences.map(s => `
        <li class="sent" data-idx="${s.flatIndex}">
          <button class="say" data-say="${s.flatIndex}" title="Nur diesen Satz anhören" aria-label="Satz anhören">▶</button>
          <div class="sent-body">
            <p class="jp">${Content.sentenceHtml(s, { statusOf: Store.status, tabbable: true })}</p>
            <p class="ro">${escapeHtml(Content.romajiLine(s.tokens))}</p>
            <p class="de">${escapeHtml(s.de)}</p>
          </div>
        </li>`).join("")}</ol>
      <div class="scene-nav">
        ${P.scene > 0 ? `<button class="secondary" data-scene="${P.scene - 1}">← Szene ${P.scene}</button>` : "<span></span>"}
        ${last
          ? `<button class="primary" data-act="check">Wortschatz-Check →</button>`
          : `<button class="secondary" data-scene="${P.scene + 1}">Szene ${P.scene + 2} →</button>`}
      </div>
      <div class="end-card ${P.ended ? "" : "hidden"}" id="pl-end">
        <b>おわり – Ende der Geschichte</b>
        <span>Du kannst sie jederzeit wieder hören. Willst du prüfen, welche Wörter du schon kennst?</span>
        <div><button class="primary" data-act="check">Wortschatz-Check starten</button> <button class="secondary" data-act="restart">Von vorn</button></div>
      </div>
      <p class="hint legend">Wort antippen = Details · <span class="tok st-saved">Merkliste</span> · <span class="tok st-active">Lernkartei</span></p>`;
    $$("#pl-scenes button", root).forEach(b => b.classList.toggle("active", Number(b.dataset.scene) === P.scene));
    applyPrefs();
  }

  function renderListenCard() {
    const s = P.story.flat[P.idx];
    const scene = P.story.scenes[s.sceneIndex];
    $("#pl-listen", root).innerHTML = `
      <div class="listen-icon">${P.playing ? "🎧" : "⏸"}</div>
      <div class="listen-meta">Szene ${s.sceneIndex + 1}/${P.story.scenes.length} · ${escapeHtml(scene.title)}</div>
      <div class="listen-meta">Satz ${s.indexInScene + 1} von ${scene.sentences.length}</div>
      ${P.peek ? `<div class="peek"><p class="jp">${Content.sentenceHtml(s, { statusOf: Store.status })}</p><p class="ro">${escapeHtml(Content.romajiLine(s.tokens))}</p><p class="de">${escapeHtml(s.de)}</p></div>` : ""}
      <div class="listen-actions">
        <button class="secondary" data-act="peek">${P.peek ? "Satz ausblenden" : "Aktuellen Satz zeigen"}</button>
        <button class="secondary" data-act="to-read">📖 Ganzen Text einblenden</button>
      </div>`;
  }

  function setCurrent(idx) {
    P.idx = idx;
    const s = P.story.flat[idx];
    if (s.sceneIndex !== P.scene) { P.scene = s.sceneIndex; renderScene(); }
    $$(".sent", root).forEach(li => li.classList.toggle("current", Number(li.dataset.idx) === idx));
    $("#pl-progress-fill", root).style.width = `${((idx + 1) / P.story.flat.length) * 100}%`;
    $("#pl-pos", root).textContent = `${idx + 1} / ${P.story.flat.length}`;
    if (prefs().mode === "listen") renderListenCard();
    Store.setPosition(P.story.id, idx);
  }

  function highlightWord(s, charIndex) {
    $$(".tok.speaking", root).forEach(t => t.classList.remove("speaking"));
    if (!s) return;
    let ti = 0;
    while (ti + 1 < s.offsets.length && s.offsets[ti + 1] <= charIndex) ti++;
    const tok = $(`.tok[data-sid="${s.id}"][data-ti="${ti}"]`, root);
    if (tok) tok.classList.add("speaking");
  }

  function updatePlayBtn() {
    const btn = $('[data-act="play"]', root);
    if (!btn) return;
    btn.textContent = P && P.playing ? "⏸" : "▶";
    btn.setAttribute("aria-label", P && P.playing ? "Pause" : "Abspielen");
    if (prefs().mode === "listen") renderListenCard();
  }

  function playFrom(idx, continuous = true) {
    if (!hasAudio() && !Speech.supported) { toast("Dein Browser hat keine Sprachausgabe."); return; }
    if (!P.started) { P.started = true; Store.startedListening(P.story.id); }
    const run = ++P.run;
    P.playing = true;
    P.ended = false;
    $("#pl-end", root) && $("#pl-end", root).classList.add("hidden");
    setCurrent(idx);
    updatePlayBtn();
    const li = $(`.sent[data-idx="${idx}"]`, root);
    if (li && prefs().mode === "read") li.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const s = P.story.flat[idx];
    const done = () => {
      if (!P || run !== P.run) return;
      highlightWord(null);
      Store.encounter(s.vocabIds.filter(v => v && Content.isLearnable(v)));
      if (continuous && idx + 1 < P.story.flat.length) {
        setTimeout(() => { if (P && run === P.run && P.playing) playFrom(idx + 1, true); }, hasAudio() ? 350 : 500);
        return;
      }
      P.playing = false;
      updatePlayBtn();
      if (continuous) finish();
    };
    const failed = msg => {
      if (!P || run !== P.run) return;
      P.playing = false;
      updatePlayBtn();
      toast(msg);
    };
    const url = Content.audioUrl(s);
    if (url) playRecording(s, url, run, done, () => speakTts(s, run, done, failed));
    else speakTts(s, run, done, failed);
    // nächsten Satz schon laden, damit es ohne Pause weitergeht
    const next = P.story.flat[idx + 1];
    const nextUrl = continuous && next && Content.audioUrl(next);
    if (nextUrl && !preload.src.endsWith(nextUrl)) preload.src = nextUrl;
  }

  // Aufnahme abspielen; Wortmarkierung anteilig zur Spielzeit (Aufnahmen haben keine Wortgrenzen)
  function playRecording(s, url, run, done, fallback) {
    Speech.cancel();
    audio.onended = () => { if (P && run === P.run) done(); };
    audio.onerror = () => { if (P && run === P.run) fallback(); };
    audio.ontimeupdate = () => {
      if (!P || run !== P.run || !audio.duration) return;
      highlightWord(s, Math.floor((audio.currentTime / audio.duration) * s.text.length));
    };
    if (!audio.src.endsWith(url)) audio.src = url;
    else audio.currentTime = 0;
    audio.playbackRate = Number(prefs().speed);
    audio.play().catch(err => { if (err.name !== "AbortError" && P && run === P.run) fallback(); });
  }

  function speakTts(s, run, done, failed) {
    if (!Speech.supported) { failed("Aufnahme fehlt und der Browser hat keine Sprachausgabe."); return; }
    const u = Speech.utterance(s.text, RATE_BASE * Number(prefs().speed));
    u.onboundary = e => { if (P && run === P.run) highlightWord(s, e.charIndex); };
    u.onerror = e => {
      if (!P || run !== P.run || e.error === "interrupted" || e.error === "canceled") return;
      failed("Sprachausgabe fehlgeschlagen.");
    };
    u.onend = done;
    Speech.play(u);
  }

  function finish() {
    P.ended = true;
    Store.completed(P.story.id);
    const end = $("#pl-end", root);
    if (end) { end.classList.remove("hidden"); end.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    if (prefs().mode === "listen") setMode("read");
  }

  function pause() {
    if (!P) return;
    P.run++;
    P.playing = false;
    Speech.cancel();
    audio.pause();
    highlightWord(null);
    updatePlayBtn();
  }
  function toggle() { P.playing ? pause() : playFrom(P.ended ? 0 : P.idx); }
  function step(d) {
    const i = Math.max(0, Math.min(P.story.flat.length - 1, P.idx + d));
    P.ended = false;
    P.playing ? playFrom(i) : setCurrent(i);
  }
  function gotoScene(si) {
    const first = P.story.scenes[si].sentences[0].flatIndex;
    P.playing ? playFrom(first) : setCurrent(first);
    window.scrollTo({ top: 0 });
  }

  // Wortstatus-Markierungen nach Änderungen auffrischen
  function refreshStatus() {
    $$(".tok[data-k]", root).forEach(t => {
      const vid = Content.vocabIdOf(t.dataset.k);
      if (!Content.isLearnable(vid)) return;
      t.classList.remove("st-unknown", "st-known", "st-saved", "st-active");
      t.classList.add(`st-${Store.status(vid)}`);
    });
  }

  root.addEventListener("click", e => {
    const tok = e.target.closest(".tok[data-k]");
    if (tok && !tok.closest(".legend")) { pause(); WordSheet.open(tok.dataset.k, tok.dataset.sid); return; }
    const say = e.target.closest("[data-say]");
    if (say) { playFrom(Number(say.dataset.say), false); return; }
    const sc = e.target.closest("[data-scene]");
    if (sc) { gotoScene(Number(sc.dataset.scene)); return; }
    const act = e.target.closest("[data-act]");
    if (!act) return;
    switch (act.dataset.act) {
      case "back": pause(); showView("library"); break;
      case "play": toggle(); break;
      case "prev": step(-1); break;
      case "next": step(1); break;
      case "repeat": playFrom(P.idx, false); break;
      case "restart": P.ended = false; playFrom(0); break;
      case "check": pause(); Check.start(P.story.id); break;
      case "peek": P.peek = !P.peek; renderListenCard(); break;
      case "to-read": setMode("read"); break;
    }
  });

  function onKey(e) {
    if (!P) return;
    if (e.target.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
    if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === "r" || e.key === "R") playFrom(P.idx, false);
    else if (e.key === "Enter" && e.target.classList.contains("tok")) { pause(); WordSheet.open(e.target.dataset.k, e.target.dataset.sid); }
  }

  // Einzelnen Satz vorspielen (Lernkartei, Merkliste): Aufnahme, sonst Browser-Stimme
  function playSentence(id) {
    const s = Content.sentence(id);
    if (!s) return;
    const url = Content.audioUrl(s);
    if (!url) { Speech.say(s.text, RATE_BASE); return; }
    Speech.cancel();
    audio.onended = audio.onerror = audio.ontimeupdate = null;
    audio.src = url;
    audio.playbackRate = 1;
    audio.play().catch(() => Speech.say(s.text, RATE_BASE));
  }

  return { open, pause, onKey, refreshStatus, playSentence };
})();

// Wortdetailansicht (Bottom-Sheet)
const WordSheet = (() => {
  const sheet = $("#word-sheet");
  const backdrop = $("#sheet-backdrop");
  let cur = null; // { key, vid, sentenceId }

  function open(key, sentenceId) {
    cur = { key, vid: Content.vocabIdOf(key), sentenceId };
    render();
    sheet.classList.add("open");
    backdrop.classList.add("open");
    Speech.say(Content.sayText(key), 0.85);
  }
  function close() {
    sheet.classList.remove("open");
    backdrop.classList.remove("open");
    cur = null;
  }

  // Heisig-Rahmen der Kanji im Wort (nur Anzeige; die Geschichten bleiben unverändert)
  function kanjiInfo(vid) {
    const ks = [...new Set([...Content.display(vid)].filter(isKanji))].map(Heisig.byKanji).filter(Boolean);
    if (!ks.length) return "";
    return `<div class="ws-kanji">${ks.map(k => {
      const learned = k.n <= Heisig.unlocked;
      const kw = Heisig.keyword(k.n);
      return `<span class="${learned ? "learned" : ""}"><b class="jp">${k.kanji}</b> Rahmen ${k.n}${learned ? ` ✓${kw ? ` · ${escapeHtml(kw)}` : ""}` : ""}</span>`;
    }).join("")}</div>`;
  }

  function render() {
    const { key, vid, sentenceId } = cur;
    const w = DICT[key], v = DICT[vid];
    const s = Content.sentence(sentenceId);
    const learnable = Content.isLearnable(vid);
    const status = Store.status(vid);
    let formInfo = "";
    if (vid !== key && v.r !== w.r) formInfo = `Grundform: <b class="jp">${furiganaHtml(Content.display(vid), v.r)}</b> – ${escapeHtml(v.de)}`;
    else if (vid !== key) formInfo = `Mit Kanji: <b class="jp">${furiganaHtml(Content.display(vid), v.r)}</b>`;
    else if (v.k) formInfo = `Mit Kanji: <b class="jp">${furiganaHtml(v.k, v.r)}</b>`;
    const card = Store.cardOf(vid);
    let action = "";
    if (learnable) {
      if (status === "active") action = `<button class="primary" disabled>✓ In der Lernkartei · Fach ${Scheduler.boxOf(card)}</button>`;
      else if (status === "saved") action = `<button class="primary" disabled>✓ In der Merkliste</button><button class="link" data-ws="unsave">entfernen</button>`;
      else action = `<button class="primary" data-ws="save">＋ Zur Merkliste</button>`;
    }
    const knownToggle = learnable && status !== "active" && status !== "saved"
      ? `<button class="link" data-ws="known">${status === "known" ? "Doch nicht bekannt" : "Kenne ich schon"}</button>` : "";
    sheet.innerHTML = `
      <div class="sheet-grip"></div>
      <button class="sheet-close" data-ws="close" aria-label="Schließen">×</button>
      <div class="ws-tags">${v.pos ? `<span class="tag">${escapeHtml(v.pos)}</span>` : ""}${status === "known" ? `<span class="tag good">bekannt</span>` : ""}</div>
      <div class="ws-word jp">${furiganaHtml(key, w.r)}</div>
      <div class="ws-reading"><span class="jp">${w.r}</span> · ${escapeHtml(w.ro || kanaToRomaji(w.r))}</div>
      <div class="ws-meaning">${escapeHtml(w.de)}${learnable ? rankBadge(vid) : ""}</div>
      ${formInfo ? `<div class="ws-info">${formInfo}</div>` : ""}
      ${w.note || (vid !== key && v.note) ? `<div class="ws-info">💡 ${escapeHtml(w.note || v.note)}</div>` : ""}
      ${kanjiInfo(vid)}
      ${s ? `<div class="ws-example">
        <p class="jp">${Content.sentenceHtml(s, { highlight: vid })}</p>
        <p class="de">${escapeHtml(s.de)}</p>
      </div>` : ""}
      <div class="ws-actions">
        <button class="secondary" data-ws="say">🔊 Wort</button>
        ${s ? `<button class="secondary" data-ws="sentence">▶ Satz</button>` : ""}
      </div>
      <div class="ws-actions">${action}${knownToggle}</div>
      ${!learnable ? `<p class="hint">Grammatikwort oder Name – wird nicht als Lernkarte vorgeschlagen.</p>` : ""}`;
  }

  sheet.addEventListener("click", e => {
    const b = e.target.closest("[data-ws]");
    if (!b || !cur) return;
    const { key, vid, sentenceId } = cur;
    switch (b.dataset.ws) {
      case "close": close(); return;
      case "say": Speech.say(Content.sayText(key), 0.85); return;
      case "sentence": Player.playSentence(sentenceId); return;
      case "save":
        Store.saveWord(vid, sentenceId, "manual");
        toast(`„${Content.display(vid)}“ ist in der Merkliste`);
        break;
      case "unsave": Store.unsave(vid); break;
      case "known": Store.setKnown(vid, Store.status(vid) !== "known"); break;
    }
    render();
    Player.refreshStatus();
    document.dispatchEvent(new CustomEvent("wordstatus"));   // z. B. Lernkarte frischt ihren Satz auf
  });
  backdrop.addEventListener("click", close);

  return { open, close, get isOpen() { return !!cur; } };
})();
