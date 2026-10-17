"use strict";
// Oberfläche: Navigation und Ansichten (Heute, Bibliothek, Merkliste, Wortschatz-Check, Lernkartei, Profil)

// ---------- Navigation ----------
const TAB_OF = { player: "library", check: "library", kana: "profile" };
const RENDER = {};
let currentView = "today";

function showView(name) {
  if (name !== "player") Player.pause();
  WordSheet.close();
  currentView = name;
  $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  const tab = TAB_OF[name] || name;
  $$("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.view === tab));
  if (RENDER[name]) RENDER[name]();
  window.scrollTo(0, 0);
}
$("#tabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-view]");
  if (b) showView(b.dataset.view);
});
// Allgemeine Sprungziele in allen Ansichten
document.addEventListener("click", e => {
  const go = e.target.closest("[data-goto]");
  if (go) { showView(go.dataset.goto); return; }
  if (e.target.closest("[data-goto-session]")) { showView("deck"); Deck.start("due"); return; }
  const open = e.target.closest("[data-open-story]");
  if (open) Player.open(open.dataset.openStory, open.dataset.pos != null ? Number(open.dataset.pos) : undefined);
});

const wordHtml = (vid, furigana = true) => furiganaHtml(Content.display(vid), Content.reading(vid));
const rankBadge = vid => {
  const r = Content.rank(vid);
  return r ? `<span class="rank" title="Häufigkeitsrang im Japanischen (Leeds-Korpus)">#${r.toLocaleString("de-DE")}</span>` : "";
};
const storyTitle = id => { const s = Content.story(id); return s ? s.titleJp : ""; };
function fmtDue(t) {
  const now = Date.now();
  if (t <= now) return "jetzt";
  const days = Math.round((Scheduler.dayStart(t) - Scheduler.dayStart(now)) / Scheduler.DAY);
  if (days === 0) return `heute, ${new Date(t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 1) return "morgen";
  return `in ${days} Tagen`;
}
const estMinutes = story => Math.max(1, Math.round(story.flat.reduce((n, s) => n + s.text.length, 0) * 0.28 / 60));

// ---------- Heute ----------
RENDER.today = () => {
  const now = Date.now();
  const story = Content.story(Store.db.currentStoryId) || Content.stories[0];
  const prog = Store.progress(story.id);
  const due = Store.dueQueue(now).length;
  const gate = due === 0;
  const allowance = gate ? Store.newAllowance(now) : 0;
  const practiceN = Store.practiceCards(now).length;
  const kanjiDue = Heisig.dueQueue(now).length;
  const savedN = Store.db.saved.length;
  const started = prog.position > 0;
  const recent = [
    ...Store.db.saved.map(s => ({ vid: s.vocabId, t: s.savedAt, label: "Merkliste" })),
    ...Store.db.cards.map(c => ({ vid: c.vocabId, t: c.lastReviewedAt || c.activatedAt, label: `Fach ${Scheduler.boxOf(c)}` })),
  ].sort((a, b) => b.t - a.t).slice(0, 8);

  let next;
  if (!gate) next = `
    <p><b>Zuerst die Tagesabfrage:</b> ${due} ${due === 1 ? "Karte ist" : "Karten sind"} fällig. Danach sind Geschichten und neue Wörter freigeschaltet.</p>
    <button class="primary big" data-act="session">Tagesabfrage starten · ${due}</button>`;
  else if (savedN && allowance) next = `<p class="ok-line">✓ Tagesabfrage erledigt</p><button class="primary big" data-goto="saved">Neue Karten aus der Merkliste wählen</button>`;
  else next = `<p class="ok-line">✓ Tagesabfrage erledigt</p><p class="hint">Hör einfach weiter – die Geschichte ist das Wichtigste.</p>`;
  if (practiceN) next += `<p class="hint">Fach 1 kannst du heute noch beliebig üben (${practiceN} ${practiceN === 1 ? "Karte" : "Karten"}). <button class="link" data-act="practice">Jetzt üben</button></p>`;

  $("#today").innerHTML = `
    <div class="panel today-next">${next}</div>
    <div class="panel story-hero ${gate ? "" : "locked"}">
      <div class="story-art">${story.icon}</div>
      <div class="story-hero-body">
        <span class="kicker">Aktuelle Geschichte</span>
        <h2><span class="jp">${story.titleJp}</span> <small>${escapeHtml(story.titleDe)}</small></h2>
        <div class="progress"><div class="progress-bar" style="width:${(prog.position / story.flat.length) * 100}%"></div></div>
        <p class="hint">${started ? `Satz ${prog.position + 1} von ${story.flat.length}` : "Noch nicht begonnen"} · ${prog.listenCount}× gehört</p>
        <div class="row">
          ${gate ? `<button class="primary" data-open-story="${story.id}">▶ ${started ? "Weiterhören" : "Anhören"}</button>`
            : `<button class="primary" disabled>🔒 Nach der Tagesabfrage</button>`}
          <button class="secondary" data-goto="library">Andere Geschichte</button>
        </div>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><b>${due}</b><span>Karten fällig</span></div>
      <div class="stat"><b>${gate ? allowance : "–"}</b><span>neue Karten heute möglich</span></div>
      <div class="stat"><b>${savedN}</b><span>Wörter in der Merkliste</span></div>
      <div class="stat"><b>${Store.streak()}</b><span>Lerntage in Folge</span></div>
    </div>
    <button class="panel today-kanji" data-goto="kanji">
      <span class="jp">漢</span>
      <span><b>Kanji nach Heisig</b> · Rahmen ${Heisig.unlocked} von ${Heisig.TOTAL}${kanjiDue ? ` · <b>${kanjiDue}</b> fällig` : ""}</span>
      <span class="hint">→</span>
    </button>
    ${recent.length ? `<div class="panel"><h3>Zuletzt gelernt & gesammelt</h3><div class="chips">${recent.map(r =>
      `<span class="chip"><span class="jp">${wordHtml(r.vid)}</span> ${escapeHtml(DICT[r.vid].de)} <small>${r.label}</small></span>`).join("")}</div></div>` : ""}`;
};
$("#today").addEventListener("click", e => {
  if (e.target.closest('[data-act="session"]')) { showView("deck"); Deck.start("due"); }
  if (e.target.closest('[data-act="practice"]')) { showView("deck"); Deck.start("practice"); }
});

// ---------- Bibliothek ----------
RENDER.library = () => {
  const due = Store.dueQueue().length;
  $("#library").innerHTML = (due ? `
    <div class="panel gate-note">🔒 Zuerst die Tagesabfrage (${due} ${due === 1 ? "Karte" : "Karten"}), dann geht's mit den Geschichten weiter.
      <button class="primary" data-goto-session>Tagesabfrage starten</button></div>` : "") + Content.stories.map(s => {
    const p = Store.progress(s.id);
    return `
      <button class="story-card" data-open-story="${s.id}">
        <div class="story-art small">${s.icon}</div>
        <div class="story-card-body">
          <b><span class="jp">${s.titleJp}</span> <small>${escapeHtml(s.titleDe)}</small></b>
          <span class="desc">${escapeHtml(s.description)}</span>
          <span class="meta">${escapeHtml(s.level)} · ${escapeHtml(s.genre)} · ${s.scenes.length} ${s.scenes.length === 1 ? "Szene" : "Szenen"} · ca. ${estMinutes(s)} Min.${p.listenCount ? ` · ${p.listenCount}× gehört` : ""}</span>
          ${p.position > 0 ? `<div class="progress"><div class="progress-bar" style="width:${(p.position / s.flat.length) * 100}%"></div></div>` : ""}
        </div>
      </button>`;
  }).join("");
};

// ---------- Merkliste ----------
const selected = new Set();
RENDER.saved = () => {
  const gate = Store.gateOpen();
  const allowance = gate ? Store.newAllowance() : 0;
  const lapses = Store.lapsesToday();
  for (const vid of [...selected]) if (!Store.savedOf(vid)) selected.delete(vid);
  // Häufigste Wörter des Japanischen zuerst
  const list = [...Store.db.saved].sort((a, b) => Content.byRank(a.vocabId, b.vocabId) || b.savedAt - a.savedAt);
  let limitText = `Heute kannst du noch <b>${allowance}</b> ${allowance === 1 ? "neue Karte" : "neue Karten"} aktivieren.`;
  if (lapses) limitText += ` ${lapses} ${lapses === 1 ? "Platz ist" : "Plätze sind"} schon durch Karten belegt, die heute zurück in Fach 1 gefallen sind.`;
  if (allowance === 0) limitText = "Für heute ist Fach 1 voll (12 Karten inklusive Rückfälle). Morgen geht es weiter.";
  if (!gate) limitText = `🔒 Erst die Tagesabfrage erledigen (${Store.dueQueue().length} fällig) – dann kannst du neue Karten aktivieren. <button class="link" data-goto-session>Tagesabfrage starten</button>`;

  $("#saved").innerHTML = list.length ? `
    <div class="panel saved-head">
      <p>${limitText}</p>
      <div class="row">
        <button class="secondary" data-act="suggest" ${allowance ? "" : "disabled"}>Vorschlag auswählen</button>
        <button class="primary" data-act="activate" ${selected.size && allowance ? "" : "disabled"}>In die Lernkartei (${selected.size})</button>
      </div>
    </div>
    <ul class="saved-list">${list.map(item => {
      const vid = item.vocabId;
      const s = Content.sentence(item.sentenceId) || Content.firstSentenceAny(vid);
      return `
        <li class="saved-item ${selected.has(vid) ? "selected" : ""}">
          <label class="saved-check"><input type="checkbox" data-vid="${escapeHtml(vid)}" ${selected.has(vid) ? "checked" : ""}></label>
          <div class="saved-body">
            <div><span class="saved-word jp">${wordHtml(vid)}</span> <span class="saved-de">${escapeHtml(DICT[vid].de)}</span>${rankBadge(vid)}</div>
            ${s ? `<div class="saved-ex jp">${Content.sentenceHtml(s, { highlight: vid })}</div><div class="saved-ex-de">${escapeHtml(s.de)}</div>` : ""}
            <div class="meta">${s ? `<a href="#" data-open-story="${s.storyId}" data-pos="${s.flatIndex}">${storyTitle(s.storyId)} · Szene ${s.sceneIndex + 1}</a> · ` : ""}${item.source === "check" ? "Wortschatz-Check" : "markiert"}</div>
          </div>
          <div class="saved-tools">
            <button class="icon-btn" data-say="${escapeHtml(vid)}" title="Anhören">🔊</button>
            <button class="icon-btn" data-remove="${escapeHtml(vid)}" title="Aus der Merkliste entfernen">×</button>
          </div>
        </li>`;
    }).join("")}</ul>` : `
    <div class="panel empty">
      <p>Deine Merkliste ist noch leer.</p>
      <p class="hint">Tippe beim Hören oder Lesen auf ein Wort und wähle „Zur Merkliste“ – oder mache nach einer Geschichte den Wortschatz-Check.</p>
      <button class="primary" data-goto="library">Zu den Geschichten</button>
    </div>`;
};
$("#saved").addEventListener("change", e => {
  const box = e.target.closest("input[data-vid]");
  if (!box) return;
  const vid = box.dataset.vid;
  const allowance = Store.gateOpen() ? Store.newAllowance() : 0;
  if (box.checked && selected.size >= allowance) {
    box.checked = false;
    toast(Store.gateOpen() ? `Heute sind höchstens ${allowance} neue Karten möglich.` : "Erst die Tagesabfrage erledigen.");
    return;
  }
  box.checked ? selected.add(vid) : selected.delete(vid);
  RENDER.saved();
});
$("#saved").addEventListener("click", e => {
  if (e.target.closest("a[data-open-story]")) e.preventDefault();
  const say = e.target.closest("[data-say]");
  if (say) { Speech.say(Content.reading(say.dataset.say), 0.85); return; }
  const rm = e.target.closest("[data-remove]");
  if (rm) { selected.delete(rm.dataset.remove); Store.unsave(rm.dataset.remove); RENDER.saved(); return; }
  const act = e.target.closest("[data-act]");
  if (!act) return;
  if (act.dataset.act === "suggest") {
    // Die im Japanischen häufigsten Wörter zuerst
    selected.clear();
    Store.db.saved.map(s => s.vocabId).sort(Content.byRank).slice(0, Store.newAllowance()).forEach(v => selected.add(v));
    RENDER.saved();
  } else if (act.dataset.act === "activate") {
    const n = Store.activate([...selected]);
    selected.clear();
    toast(`${n} ${n === 1 ? "Karte" : "Karten"} in Fach 1 – los geht's!`);
    showView("deck");
  }
});

// ---------- Wortschatz-Check ----------
const Check = (() => {
  let C = null; // { storyId, list, i, revealed, known, saved }

  function start(storyId) {
    const list = Content.storyVocab(storyId).filter(v => Store.status(v) === "unknown");
    C = { storyId, list, i: 0, revealed: false, known: 0, saved: 0 };
    showView("check");
  }

  function render() {
    const el = $("#check");
    if (!C) {
      el.innerHTML = `<h2>Wortschatz-Check</h2><p class="hint">Wähle eine Geschichte:</p>
        <div class="row wrap">${Content.stories.map(s => `<button class="secondary" data-check="${s.id}"><span class="jp">${s.titleJp}</span></button>`).join("")}</div>`;
      return;
    }
    const story = Content.story(C.storyId);
    if (C.i >= C.list.length) {
      el.innerHTML = `
        <h2>Check abgeschlossen</h2>
        <p>${C.list.length ? `<b>${C.known}</b> Wörter kanntest du schon, <b>${C.saved}</b> sind jetzt in deiner Merkliste.`
          : "In dieser Geschichte gibt es keine neuen Wörter mehr zu prüfen – alle sind bekannt, gemerkt oder in der Lernkartei."}</p>
        <div class="row wrap">
          ${Store.db.saved.length ? `<button class="primary" data-goto="saved">Zur Merkliste</button>` : ""}
          <button class="secondary" data-open-story="${story.id}">Zurück zur Geschichte</button>
        </div>`;
      return;
    }
    const vid = C.list[C.i];
    const s = Content.sentence(story.firstSentence[vid]);
    el.innerHTML = `
      <div class="check-top">
        <span class="hint">Wort ${C.i + 1} von ${C.list.length} · <span class="jp">${story.titleJp}</span></span>
        <button class="link" data-act="finish">Check beenden</button>
      </div>
      <div class="progress"><div class="progress-bar" style="width:${(C.i / C.list.length) * 100}%"></div></div>
      <div class="check-word jp">${wordHtml(vid)}</div>
      <p class="hint center">Was bedeutet das Wort? Überlege – dann aufdecken.</p>
      <div class="check-ex"><p class="jp">${Content.sentenceHtml(s, { highlight: vid })}</p>
        ${C.revealed ? `<p class="de">${escapeHtml(s.de)}</p>` : ""}</div>
      ${C.revealed ? `<div class="check-answer">${escapeHtml(DICT[vid].de)} <small>${escapeHtml(DICT[vid].ro || kanaToRomaji(DICT[vid].r))}</small></div>` : ""}
      <div class="row center">
        <button class="secondary" data-act="say">🔊 Anhören</button>
        ${C.revealed ? `
          <button class="rate bad" data-act="unknown">✗ Nicht gewusst <kbd>1</kbd></button>
          <button class="rate good" data-act="known">✓ Gewusst <kbd>2</kbd></button>`
          : `<button class="primary" data-act="reveal">Aufdecken <kbd>Leertaste</kbd></button>`}
      </div>`;
  }
  RENDER.check = render;

  function answer(known) {
    const vid = C.list[C.i];
    if (known) { Store.setKnown(vid, true); C.known++; }
    else if (Store.saveWord(vid, Content.story(C.storyId).firstSentence[vid], "check")) C.saved++;
    C.i++;
    C.revealed = false;
    render();
  }

  $("#check").addEventListener("click", e => {
    const chk = e.target.closest("[data-check]");
    if (chk) { start(chk.dataset.check); return; }
    const act = e.target.closest("[data-act]");
    if (!act || !C) return;
    const vid = C.list[C.i];
    switch (act.dataset.act) {
      case "reveal": C.revealed = true; render(); break;
      case "say": Speech.say(Content.reading(vid), 0.85); break;
      case "known": answer(true); break;
      case "unknown": answer(false); break;
      case "finish": C.i = C.list.length; render(); break;
    }
  });

  function onKey(e) {
    if (!C || C.i >= C.list.length) return;
    if (e.key === " " && !C.revealed) { e.preventDefault(); C.revealed = true; render(); }
    else if (C.revealed && e.key === "1") answer(false);
    else if (C.revealed && e.key === "2") answer(true);
  }
  return { start, onKey };
})();

// ---------- Lernkartei ----------
const Deck = (() => {
  let S = null; // { mode: "due" | "practice", queue, revealed, done, good, again }
  const BOX_HELP = ["", "täglich · Furigana · Aussprache automatisch", "nach 2 Tagen · Furigana · Audio auf Knopfdruck",
    "nach 5 Tagen · ohne Furigana", "nach 14 Tagen · ohne Furigana", "nach 35 Tagen, dann alle 90 Tage"];

  function renderOverview() {
    const now = Date.now();
    const due = Store.dueQueue(now);
    const dueTotal = Store.dueTotal(now);
    const practice = Store.practiceCards(now);
    const boxes = [1, 2, 3, 4, 5].map(b => Store.db.cards.filter(c => c.box === b));
    const nextDue = Store.db.cards.filter(c => c.dueAt > now).sort((a, b) => a.dueAt - b.dueAt)[0];
    const allowance = Store.newAllowance(now);
    const box1Due = due.filter(c => c.box === 1).length;
    let head;
    if (due.length) head = `
      <p><b>Tagesabfrage:</b> ${due.length} ${due.length === 1 ? "Karte" : "Karten"}${box1Due ? ` – zuerst ${box1Due} aus Fach 1` : ""}.
        Gewusst → ein Fach weiter, nicht gewusst → zurück in Fach 1.</p>
      <button class="primary big" data-act="start-due">Tagesabfrage starten</button>
      <p class="hint">Danach sind Geschichten und neue Wörter freigeschaltet.</p>`;
    else if (dueTotal) head = `<p class="ok-line">✓ Für heute genug abgefragt (${Scheduler.MAX_REVIEWS_PER_DAY} Karten).</p><p class="hint">Die restlichen ${dueTotal} fälligen Karten kommen morgen dran.</p>`;
    else head = `<p class="ok-line">✓ Tagesabfrage erledigt</p>${nextDue ? `<p class="hint">Nächste Abfrage: <b>${fmtDue(nextDue.dueAt)}</b>.</p>` : ""}`;
    $("#deck").innerHTML = `
      <div class="panel deck-head">
        ${head}
        <div class="row center">
          ${practice.length ? `<button class="secondary" data-act="start-practice">Fach 1 üben · ${practice.length} (zählt nicht)</button>` : ""}
          ${!due.length && Store.db.saved.length && allowance ? `<button class="secondary" data-goto="saved">＋ Neue Karten aus der Merkliste (${allowance} frei)</button>` : ""}
        </div>
      </div>
      <div class="boxes4 boxes5">${boxes.map((cards, i) => {
        const b = i + 1;
        const dueN = cards.filter(c => Scheduler.isDue(c, now)).length;
        return `
          <div class="box4 box4-${b}">
            <div class="box4-head"><b>Fach ${b}</b><span>${Scheduler.BOX_NAMES[b]}</span></div>
            <div class="box4-count">${cards.length}</div>
            <div class="box4-due">${dueN ? `${dueN} fällig` : "&nbsp;"}</div>
            <div class="box4-help">${BOX_HELP[b]}</div>
            <div class="box4-words">${cards.slice(0, 10).map(c => `<span class="jp">${escapeHtml(Content.display(c.vocabId))}</span>`).join(" ")}${cards.length > 10 ? ` +${cards.length - 10}` : ""}</div>
          </div>`;
      }).join("")}</div>
      ${Store.db.cards.length ? "" : `<p class="hint on-page">Noch keine Karten. Sammle Wörter in den Geschichten und aktiviere bis zu ${Scheduler.MAX_NEW_PER_DAY} pro Tag aus der Merkliste.</p>`}`;
  }

  // mode "due": Pflichtabfrage der fälligen Karten · "practice": Fach 1 frei üben (ohne Wirkung)
  function start(mode = "due") {
    const cards = mode === "practice" ? shuffle(Store.practiceCards()) : Store.dueQueue();
    if (!cards.length) { toast(mode === "practice" ? "In Fach 1 ist heute nichts zu üben." : "Gerade ist keine Karte fällig."); renderOverview(); return; }
    S = { mode, queue: cards.map(c => c.id), revealed: false, done: 0, good: 0, again: 0 };
    renderSession(true);
  }

  function sentenceFor(card) {
    return Content.sentence(card.sentenceId) || Content.firstSentenceAny(card.vocabId);
  }

  function renderSession(fresh) {
    const el = $("#deck");
    if (!S.queue.length) {
      const practice = Store.practiceCards().length;
      const due = S.mode === "due";
      el.innerHTML = `
        <div class="panel center">
          <h2>お疲れさま！ <small>${due ? "Tagesabfrage erledigt" : "Fach 1 geübt"}</small></h2>
          <p>${due ? `<b>${S.done}</b> Karten abgefragt · ${S.good}× gewusst · ${S.again}× zurück in Fach 1`
            : `${S.done} Durchgänge geübt. Ob die Karten in Fach 2 kommen, entscheidet die Abfrage morgen.`}</p>
          ${due && Store.gateOpen() ? `<p class="ok-line">Geschichten und neue Wörter sind jetzt freigeschaltet.</p>` : ""}
          <div class="row center">
            ${due && practice ? `<button class="secondary" data-act="start-practice">Fach 1 üben · ${practice}</button>` : ""}
            ${due && Store.gateOpen() ? `<button class="secondary" data-goto="library">Zu den Geschichten</button>` : ""}
            <button class="primary" data-act="close">Fertig</button>
          </div>
        </div>`;
      return;
    }
    const card = Store.db.cards.find(c => c.id === S.queue[0]);
    const vid = card.vocabId, v = DICT[vid];
    const box = Scheduler.boxOf(card);
    const furi = box <= 2;
    const s = sentenceFor(card);
    el.innerHTML = `
      <div class="session-top">
        <span class="hint on-page"><b>${S.mode === "due" ? "Tagesabfrage" : "Fach 1 üben – zählt nicht"}</b> · ${S.done} erledigt · ${S.queue.length} übrig</span>
        <button class="link on-page" data-act="end">${S.mode === "due" ? "Unterbrechen" : "Beenden"}</button>
      </div>
      <div class="panel flash ${S.revealed ? "revealed" : ""}">
        <span class="tag box-tag box4-${box}">Fach ${box} · ${Scheduler.BOX_NAMES[box]}</span>
        <div class="flash-word jp">${furi || S.revealed ? wordHtml(vid) : escapeHtml(Content.display(vid))}</div>
        ${S.revealed ? `
          <div class="flash-reading"><span class="jp">${v.r}</span> · ${escapeHtml(v.ro || kanaToRomaji(v.r))}</div>
          <div class="flash-meaning">${escapeHtml(v.de)}</div>` : ""}
        ${s ? `<div class="flash-ex">
          <p class="jp">${Content.sentenceHtml(s, { highlight: vid, furigana: furi || S.revealed })}</p>
          ${S.revealed ? `<p class="de">${escapeHtml(s.de)}</p>` : ""}
        </div>` : ""}
        <div class="row center">
          <button class="secondary" data-act="say-word">🔊 Wort</button>
          ${s ? `<button class="secondary" data-act="say-sentence">▶ Satz</button>` : ""}
          ${S.revealed && s && Store.gateOpen() ? `<button class="secondary" data-open-story="${s.storyId}" data-pos="${s.flatIndex}">↗ Zur Geschichte</button>` : ""}
        </div>
        ${S.revealed && s ? `<p class="hint center">Aus <span class="jp">${storyTitle(s.storyId)}</span> · Szene ${s.sceneIndex + 1}</p>` : ""}
        <div class="row center rate-row">
          ${S.revealed ? `
            <button class="rate bad" data-act="again">Noch nicht <kbd>1</kbd></button>
            <button class="rate good" data-act="good">Gewusst <kbd>2</kbd></button>`
            : `<button class="primary big" data-act="reveal">Aufdecken <kbd>Leertaste</kbd></button>`}
        </div>
      </div>`;
    if (fresh && box === 1) Speech.say(v.say || v.r, 0.85); // Fach 1: Aussprache automatisch
  }

  function rate(rating) {
    const id = S.queue.shift();
    S.done++;
    rating === "good" ? S.good++ : S.again++;
    if (S.mode === "due") {
      const box = Store.db.cards.find(c => c.id === id).box;
      Store.review(id, rating, { furigana: box <= 2, autoAudio: box === 1 });
    } else {
      // Üben: nicht gewusste Karten kommen nach ein paar anderen nochmal
      Store.practice(id, rating);
      if (rating === "again") S.queue.splice(Math.min(3, S.queue.length), 0, id);
    }
    S.revealed = false;
    renderSession(true);
  }

  // Beim Öffnen des Tabs: laufende Einheit fortsetzen, abgeschlossene → Übersicht
  RENDER.deck = () => {
    if (S && S.queue.length) renderSession(false);
    else { S = null; renderOverview(); }
  };

  $("#deck").addEventListener("click", e => {
    const act = e.target.closest("[data-act]");
    if (!act) return;
    const card = S && S.queue.length ? Store.db.cards.find(c => c.id === S.queue[0]) : null;
    switch (act.dataset.act) {
      case "start-due": start("due"); break;
      case "start-practice": start("practice"); break;
      case "reveal": S.revealed = true; renderSession(false); break;
      case "again": rate("again"); break;
      case "good": rate("good"); break;
      case "say-word": if (card) Speech.say(DICT[card.vocabId].say || DICT[card.vocabId].r, 0.85); break;
      case "say-sentence": if (card) Player.playSentence(sentenceFor(card).id); break;
      case "end": case "close": S = null; renderOverview(); break;
    }
  });

  function onKey(e) {
    if (!S || !S.queue.length) return;
    if (e.target.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
    if (e.key === " " && !S.revealed) { e.preventDefault(); S.revealed = true; renderSession(false); }
    else if (S.revealed && e.key === "1") rate("again");
    else if (S.revealed && e.key === "2") rate("good");
  }
  return { start, onKey };
})();

// ---------- Profil ----------
const TOPICS = ["Märchen", "Mystery", "Alltag", "Kultur", "Natur", "Humor", "Reisen", "Essen"];
RENDER.profile = () => {
  const db = Store.db;
  const allVocab = [...new Set(Content.stories.flatMap(s => Content.storyVocab(s.id)))];
  const count = st => allVocab.filter(v => Store.status(v) === st).length;
  const good = db.reviews.filter(r => r.rating === "good").length;
  $("#profile").innerHTML = `
    <div class="stats">
      <div class="stat"><b>${count("known")}</b><span>bekannte Wörter</span></div>
      <div class="stat"><b>${db.cards.length}</b><span>aktive Lernkarten</span></div>
      <div class="stat"><b>${db.saved.length}</b><span>in der Merkliste</span></div>
      <div class="stat"><b>${count("unknown")}</b><span>noch nicht gelernt</span></div>
      <div class="stat"><b>${db.reviews.length}</b><span>Wiederholungen${db.reviews.length ? ` · ${Math.round((good / db.reviews.length) * 100)} % gewusst` : ""}</span></div>
      <div class="stat"><b>${Store.streak()}</b><span>Lerntage in Folge</span></div>
    </div>
    <div class="panel">
      <h3>Geschichten</h3>
      <table class="progress-table">${Content.stories.map(s => {
        const p = Store.progress(s.id);
        return `<tr><td class="jp">${s.titleJp}</td><td>${escapeHtml(s.titleDe)}</td><td>${p.listenCount}× gehört</td><td>${p.completedCount}× bis zum Ende</td></tr>`;
      }).join("")}</table>
    </div>
    <div class="panel">
      <h3>Bevorzugte Themen</h3>
      <p class="hint">Wird später genutzt, um neue Geschichten auszuwählen.</p>
      <div class="chips">${TOPICS.map(t => `<button class="chip toggle ${db.prefs.topics.includes(t) ? "on" : ""}" data-topic="${t}">${t}</button>`).join("")}</div>
    </div>
    <div class="panel">
      <h3>Kana üben</h3>
      <div class="row wrap">
        <button class="secondary" data-kana="table">あ Kana-Tabelle</button>
        <button class="secondary" data-kana="quiz">ア Kana-Quiz</button>
      </div>
    </div>
    <div class="panel">
      <h3>Daten</h3>
      <p class="hint">Dein Lernstand wird in diesem Browser gespeichert. Mit einer Sicherung kannst du ihn auf ein anderes Gerät übertragen.</p>
      <div class="row wrap">
        <button class="secondary" data-act="export">Sicherung herunterladen</button>
        <label class="secondary file-btn">Sicherung laden<input type="file" accept=".json,application/json" id="import-file" hidden></label>
        <button class="secondary danger" data-act="reset">Alles zurücksetzen</button>
        <a class="secondary" href="tests.html" target="_blank" rel="noopener">Tests ausführen</a>
      </div>
    </div>
    <p class="hint on-page">Quellen: Häufigkeitsränge aus dem Leeds Internet Corpus (CC BY 2.5) ·
      Kanji-Daten aus KANJIDIC2, EDRDG (CC BY-SA 4.0) · Strichfolgen aus KanjiVG, Ulrich Apel (CC BY-SA 3.0)</p>`;
};
$("#profile").addEventListener("click", e => {
  const t = e.target.closest("[data-topic]");
  if (t) {
    const topics = Store.db.prefs.topics;
    const i = topics.indexOf(t.dataset.topic);
    i >= 0 ? topics.splice(i, 1) : topics.push(t.dataset.topic);
    Store.persist();
    t.classList.toggle("on", i < 0);
    return;
  }
  const k = e.target.closest("[data-kana]");
  if (k) { showView("kana"); KanaPractice.mode(k.dataset.kana); return; }
  const act = e.target.closest("[data-act]");
  if (!act) return;
  if (act.dataset.act === "export") {
    const blob = new Blob([Store.exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `binjeru-sicherung-${todayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } else if (act.dataset.act === "reset") {
    if (!confirm("Wirklich den gesamten Lernstand löschen (Merkliste, Lernkartei, Kanji, Fortschritt)?")) return;
    Store.reset();
    RENDER.profile();
    toast("Lernstand zurückgesetzt");
  }
});
$("#profile").addEventListener("change", e => {
  if (e.target.id !== "import-file" || !e.target.files[0]) return;
  e.target.files[0].text().then(text => {
    try { Store.importJson(text); toast("Sicherung geladen"); RENDER.profile(); }
    catch (err) { toast(`Laden fehlgeschlagen: ${err.message}`); }
  });
});

RENDER.kana = () => KanaPractice.refresh();
RENDER.kanji = () => KanjiView.render();

// ---------- Tastatur ----------
document.addEventListener("keydown", e => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (WordSheet.isOpen) { if (e.key === "Escape") WordSheet.close(); return; }
  if (currentView === "player") Player.onKey(e);
  else if (currentView === "check") Check.onKey(e);
  else if (currentView === "deck") Deck.onKey(e);
  else if (currentView === "kana") KanaPractice.onKey(e);
  else if (currentView === "kanji") KanjiView.onKey(e);
});

// ---------- Start ----------
showView("today");
