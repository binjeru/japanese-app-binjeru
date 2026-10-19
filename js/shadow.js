"use strict";
// Shadowing: ausgewählte Sätze nacheinander hören und in der Pause selbst nachsprechen.
// Jeder Satz wird n-mal wiederholt, dazwischen eine Pause (mindestens so lang wie der Satz + 0,5 s);
// nach dem letzten Satz geht es wieder von vorn, bis man stoppt.
// Statistik in db.shadow: wie oft jeder Satz beim Shadowing gehört wurde.

const Shadow = (() => {
  const root = $("#shadow");
  const SPEECH_RATE = 0.9;
  const MIN_GAP = 0.5;                 // Sekunden, die die Pause mindestens länger ist als der Satz
  const REPS = [1, 2, 3, 5, 10];
  const PAUSES = [2, 3, 5, 8];
  const DEFAULTS = { source: "box1", reps: 3, pause: 3, speed: "1", showText: true, furi: true, de: false };

  const audio = new Audio();
  audio.preload = "auto";
  let SH = { playing: false, list: [], i: 0, rep: 1, phase: "", run: 0, excluded: new Set(), dirty: 0 };
  let cancel = null;                   // bricht das aktuelle Abspielen / Warten ab
  let wakeLock = null;

  const prefs = () => (Store.db.prefs.shadow = Object.assign({}, DEFAULTS, Store.db.prefs.shadow));
  const stats = () => (Store.db.shadow = Object.assign({ plays: {}, days: {}, total: 0 }, Store.db.shadow));

  // ---------- Quellen ----------
  function sources() {
    const out = [1, 2, 3, 4, 5].map(b => ({ id: `box${b}`, label: `Lernkartei · Fach ${b}` }));
    out.push({ id: "cards", label: "Lernkartei · alle Fächer" }, { id: "saved", label: "Merkliste" });
    for (const m of Content.catalog) out.push({ id: `story:${m.id}`, label: `Geschichte · ${m.titleJp}` });
    return out;
  }
  const cardSentence = c => Content.sentence(c.sentenceId) || Content.firstSentenceAny(c.vocabId);
  function sentencesOf(source) {
    let list = [];
    if (source.startsWith("box")) list = Store.db.cards.filter(c => Scheduler.boxOf(c) === Number(source.slice(3))).map(cardSentence);
    else if (source === "cards") list = Store.db.cards.map(cardSentence);
    else if (source === "saved") list = Store.db.saved.map(s => Content.sentence(s.sentenceId) || Content.firstSentenceAny(s.vocabId));
    else if (source.startsWith("story:")) { const st = Content.story(source.slice(6)); list = st ? st.flat : []; }
    const seen = new Set();
    return list.filter(s => s && !seen.has(s.id) && seen.add(s.id));
  }
  const selected = () => sentencesOf(prefs().source).filter(s => !SH.excluded.has(s.id));

  // ---------- Abspielen ----------
  // Spielt einen Satz einmal ab; liefert die Dauer in Sekunden (0 bei Abbruch)
  function playOnce(s) {
    return new Promise(resolve => {
      const speed = Number(prefs().speed);
      let done = false;
      const finish = sec => { if (done) return; done = true; cancel = null; resolve(sec); };
      cancel = () => { audio.pause(); Speech.cancel(); finish(0); };
      const tts = () => {
        if (!Speech.supported) { finish(1); return; }
        const t0 = Date.now();
        const u = Speech.utterance(s.text, SPEECH_RATE * speed);
        u.onend = () => finish((Date.now() - t0) / 1000);
        u.onerror = e => { if (e.error !== "interrupted" && e.error !== "canceled") finish((Date.now() - t0) / 1000); };
        Speech.play(u);
      };
      const url = Content.audioUrl(s);
      if (!url) { tts(); return; }
      audio.onended = () => finish(audio.duration / speed);
      audio.onerror = () => { if (!done) tts(); };
      audio.src = url;
      audio.playbackRate = speed;
      audio.play().catch(err => { if (err.name !== "AbortError" && !done) tts(); });
    });
  }
  function wait(sec) {
    return new Promise(resolve => {
      const t = setTimeout(() => { cancel = null; resolve(true); }, sec * 1000);
      cancel = () => { clearTimeout(t); cancel = null; resolve(false); };
    });
  }

  function count(s) {
    const st = stats();
    st.plays[s.id] = (st.plays[s.id] || 0) + 1;
    st.total++;
    const day = Scheduler.dayKey(Date.now());
    st.days[day] = (st.days[day] || 0) + 1;
    Store.touchDay();
    // Lokal sofort sichern, abgeglichen wird gesammelt (alle 10 Sätze und beim Stoppen)
    if (++SH.dirty >= 10) flush(); else Store.persist(false);
  }
  function flush() { if (SH.dirty) { SH.dirty = 0; Store.persist(); } }

  async function loop(run) {
    while (SH.playing && run === SH.run && SH.list.length) {
      const s = SH.list[SH.i];
      SH.phase = "listen";
      renderPlaying();
      const sec = await playOnce(s);
      if (run !== SH.run) return;
      count(s);
      const pause = Math.max(prefs().pause, sec + MIN_GAP);
      SH.phase = "speak";
      SH.pauseStart = Date.now();
      SH.pauseLen = pause;
      renderPlaying();
      if (!(await wait(pause)) || run !== SH.run) return;
      // nächste Wiederholung, sonst nächster Satz (nach dem letzten wieder der erste)
      if (SH.rep < prefs().reps) SH.rep++;
      else { SH.rep = 1; SH.i = (SH.i + 1) % SH.list.length; }
    }
  }

  async function start() {
    const list = selected();
    if (!list.length) { toast("Bitte mindestens einen Satz auswählen."); return; }
    SH = { ...SH, playing: true, list, i: 0, rep: 1, run: SH.run + 1 };
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { wakeLock = null; }   // Bildschirm bleibt an
    loop(SH.run);
  }
  function pauseToggle() {
    if (SH.phase === "paused") { SH.run++; loop(SH.run); return; }
    SH.run++;
    if (cancel) cancel();
    SH.phase = "paused";
    flush();
    renderPlaying();
  }
  function skip(d) {
    SH.run++;
    if (cancel) cancel();
    SH.rep = 1;
    SH.i = (SH.i + d + SH.list.length) % SH.list.length;
    loop(SH.run);
  }
  function stop() {
    SH.run++;
    if (cancel) cancel();
    SH.playing = false;
    SH.phase = "";
    flush();
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    renderSetup();
  }

  // ---------- Darstellung ----------
  function render() {
    if (Content.stories.length < Content.catalog.length) {
      root.innerHTML = `<div class="panel"><p class="hint">Sätze werden geladen …</p></div>`;
      Content.loadAll().then(() => { if (currentView === "shadow") render(); });
      return;
    }
    SH.playing ? renderPlaying() : renderSetup();
  }

  function renderSetup() {
    const p = prefs(), st = stats();
    const all = sentencesOf(p.source);
    const chosen = all.filter(s => !SH.excluded.has(s.id)).length;
    const today = st.days[Scheduler.dayKey(Date.now())] || 0;
    root.innerHTML = `
      <div class="panel shadow-setup">
        <p class="hint">Hören, dann in der Pause laut nachsprechen. Die Sätze laufen in Schleife, bis du stoppst.</p>
        <div class="field"><label for="sh-source">Sätze aus</label>
          <select id="sh-source" class="text-input">${sources().map(o => {
            const n = sentencesOf(o.id).length;
            return `<option value="${o.id}" ${o.id === p.source ? "selected" : ""}>${escapeHtml(o.label)} (${n})</option>`;
          }).join("")}</select></div>
        <div class="sh-settings">
          <div class="field"><label>Wiederholungen pro Satz</label>
            <div class="segmented small" id="sh-reps">${REPS.map(n => `<button data-v="${n}">${n}×</button>`).join("")}</div></div>
          <div class="field"><label>Pause zum Nachsprechen</label>
            <div class="segmented small" id="sh-pause">${PAUSES.map(n => `<button data-v="${n}">${n} s</button>`).join("")}</div>
            <p class="hint">Mindestens so lang wie der Satz selbst + ${String(MIN_GAP).replace(".", ",")} s.</p></div>
          <div class="field"><label>Tempo</label>
            <div class="segmented small" id="sh-speed"><button data-v="0.75">0,75×</button><button data-v="1">1×</button><button data-v="1.25">1,25×</button></div></div>
        </div>
        <div class="row center">
          <button class="primary big" data-sh="play" ${chosen ? "" : "disabled"}>▶ Shadowing starten · ${chosen} ${chosen === 1 ? "Satz" : "Sätze"}</button>
        </div>
        <p class="hint center">Heute ${today} ${today === 1 ? "Satz" : "Sätze"} nachgesprochen · insgesamt ${st.total}</p>
      </div>
      <div class="panel">
        <div class="sh-list-head"><h3>${chosen} von ${all.length} ausgewählt</h3>
          <span><button class="link" data-sh="all">Alle</button> <button class="link" data-sh="none">Keine</button></span></div>
        ${all.length ? `<ul class="sh-list">${all.map(s => `
          <li><label>
            <input type="checkbox" data-sid="${s.id}" ${SH.excluded.has(s.id) ? "" : "checked"}>
            <span class="sh-text"><span class="jp">${escapeHtml(s.text)}</span><small>${escapeHtml(s.de)}</small></span>
            <span class="sh-count" title="So oft beim Shadowing gehört">${st.plays[s.id] ? `${st.plays[s.id]}×` : ""}</span>
          </label></li>`).join("")}</ul>` : `<p class="hint">Hier sind noch keine Sätze. Wähle oben eine andere Quelle.</p>`}
      </div>`;
    segmented($("#sh-reps", root), String(p.reps), v => { p.reps = Number(v); Store.persist(); });
    segmented($("#sh-pause", root), String(p.pause), v => { p.pause = Number(v); Store.persist(); });
    segmented($("#sh-speed", root), p.speed, v => { p.speed = v; Store.persist(); });
  }

  function renderPlaying() {
    if (currentView !== "shadow") return;
    const p = prefs(), s = SH.list[SH.i], plays = stats().plays[s.id] || 0;
    // Countdown-Balken: läuft beim Neuzeichnen an der richtigen Stelle weiter
    const bar = SH.phase === "speak" ? `style="animation-duration:${SH.pauseLen}s;animation-delay:-${(Date.now() - SH.pauseStart) / 1000}s"` : "";
    const phase = { listen: "🎧 Hören", speak: "🗣 Jetzt du", paused: "⏸ Pause" }[SH.phase] || "";
    root.innerHTML = `
      <div class="panel shadow-play phase-${SH.phase}">
        <div class="sh-status"><span>Satz ${SH.i + 1} / ${SH.list.length}</span><span>Wiederholung ${SH.rep} / ${p.reps}</span><span>${plays}× gehört</span></div>
        <div class="sh-phase">${phase}</div>
        <div class="sh-bar"><span ${bar}></span></div>
        ${p.showText ? `<p class="jp sh-sentence">${Content.sentenceHtml(s, { furigana: p.furi })}</p>` : `<p class="sh-hidden">Text ausgeblendet – nur hören</p>`}
        ${p.showText && p.de ? `<p class="sh-de">${escapeHtml(s.de)}</p>` : ""}
        <div class="row center sh-controls">
          <button class="secondary" data-sh="prev" aria-label="Vorheriger Satz">⏮</button>
          <button class="primary big" data-sh="pause">${SH.phase === "paused" ? "▶ Weiter" : "⏸ Pause"}</button>
          <button class="secondary" data-sh="next" aria-label="Nächster Satz">⏭</button>
        </div>
        <div class="row center sh-toggles">
          <label><input type="checkbox" data-pref="showText" ${p.showText ? "checked" : ""}> Text</label>
          <label><input type="checkbox" data-pref="furi" ${p.furi ? "checked" : ""}> Furigana</label>
          <label><input type="checkbox" data-pref="de" ${p.de ? "checked" : ""}> Deutsch</label>
        </div>
        <div class="row center"><button class="link" data-sh="stop">⏹ Stoppen</button></div>
      </div>`;
  }

  root.addEventListener("click", e => {
    const b = e.target.closest("[data-sh]");
    if (!b) return;
    switch (b.dataset.sh) {
      case "play": start(); break;
      case "pause": pauseToggle(); break;
      case "next": skip(1); break;
      case "prev": skip(-1); break;
      case "stop": stop(); break;
      case "all": SH.excluded.clear(); renderSetup(); break;
      case "none": sentencesOf(prefs().source).forEach(s => SH.excluded.add(s.id)); renderSetup(); break;
    }
  });
  root.addEventListener("change", e => {
    const t = e.target;
    if (t.id === "sh-source") { prefs().source = t.value; SH.excluded.clear(); Store.persist(); renderSetup(); }
    else if (t.dataset.sid) { t.checked ? SH.excluded.delete(t.dataset.sid) : SH.excluded.add(t.dataset.sid); renderSetup(); }
    else if (t.dataset.pref) { prefs()[t.dataset.pref] = t.checked; Store.persist(); renderPlaying(); }
  });
  // Beim Verlassen der App: Zähler abgleichen
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });

  function onKey(e) {
    if (!SH.playing) return;
    if (e.key === " ") { e.preventDefault(); pauseToggle(); }
    else if (e.key === "ArrowRight") skip(1);
    else if (e.key === "ArrowLeft") skip(-1);
    else if (e.key === "Escape") stop();
  }

  return { render, stop, onKey, get playing() { return SH.playing; } };
})();
