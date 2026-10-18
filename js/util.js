"use strict";
// Allgemeine Hilfsfunktionen (ohne Abhängigkeiten zur Lernlogik)

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function weightedPick(items, weightFn) {
  const weights = items.map(weightFn);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function todayStr(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const isKanji = s => /[㐀-鿿々]/.test(s);
const kataToHira = s => [...s].map(c => {
  const code = c.charCodeAt(0);
  return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : c;
}).join("");

// Furigana: gemeinsame Kana am Anfang/Ende (Okurigana) bleiben ohne Ruby.
// 忘れました + わすれました → <ruby>忘<rt>わす</rt></ruby>れました
function furiganaHtml(surface, reading) {
  if (!isKanji(surface) || !reading || surface === reading) return escapeHtml(surface);
  const s = [...surface], r = [...reading];
  let pre = 0;
  while (pre < s.length && pre < r.length && s[pre] === r[pre]) pre++;
  let suf = 0;
  while (suf < s.length - pre && suf < r.length - pre && s[s.length - 1 - suf] === r[r.length - 1 - suf]) suf++;
  const core = s.slice(pre, s.length - suf).join("");
  const coreReading = r.slice(pre, r.length - suf).join("");
  return escapeHtml(s.slice(0, pre).join("")) +
    `<ruby>${escapeHtml(core)}<rt>${escapeHtml(coreReading)}</rt></ruby>` +
    escapeHtml(s.slice(s.length - suf).join(""));
}

// Kana → Romaji (Hepburn, ohne Längenstriche)
let ROMAJI_MAP = null;
function kanaToRomaji(kana) {
  if (!ROMAJI_MAP) {
    ROMAJI_MAP = { "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o", "を": "o", "ゔ": "vu" };
    for (const g of KANA_GROUPS) for (const row of g.rows) for (const cell of row) if (cell && !ROMAJI_MAP[cell[0]]) ROMAJI_MAP[cell[0]] = cell[1];
  }
  const s = kataToHira(kana);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two.length === 2 && ROMAJI_MAP[two] && /[ゃゅょ]/.test(two[1])) { out += ROMAJI_MAP[two]; i++; continue; }
    const c = s[i];
    if (c === "っ") {
      const next = ROMAJI_MAP[s[i + 1]] || "";
      out += next.startsWith("ch") ? "t" : next.charAt(0);
      continue;
    }
    if (c === "ー") { const v = out.match(/[aeiou]$/); out += v ? v[0] : ""; continue; }
    if (/[ぁぃぅぇぉ]/.test(c) && out) { out = out.replace(/[aeiou]$/, "") + ROMAJI_MAP[c]; continue; } // てぃ → ti
    out += ROMAJI_MAP[c] || c;
  }
  return out;
}

// Segment-Steuerelement: setzt den aktiven Knopf und meldet Änderungen
function segmented(el, value, onChange) {
  const set = v => $$("button", el).forEach(b => b.classList.toggle("active", b.dataset.v === String(v)));
  set(value);
  el.addEventListener("click", e => {
    const btn = e.target.closest("button[data-v]");
    if (!btn) return;
    set(btn.dataset.v);
    onChange && onChange(btn.dataset.v);
  });
  return { set, get: () => ($("button.active", el) || {}).dataset?.v };
}

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

// Niveau-Label einer Geschichte: erster Teil der Angabe („N3 · Originaltext“ → N3), farbig nach Stufe
function levelBadge(level) {
  const main = String(level || "").split(" · ")[0].trim();
  if (!main) return "";
  const cls = /^N[1-5]$/i.test(main) ? main.toLowerCase() : "intro";
  return `<span class="level-badge lv-${cls}" title="Niveau: ${escapeHtml(level)}">${escapeHtml(main)}</span>`;
}
const levelRest = level => String(level || "").split(" · ").slice(1).join(" · ");

// Service Worker (sw.js): sorgt dafür, dass nach einem Update einfaches Neuladen genügt, und hält
// die App offline verfügbar. Nur über http(s) möglich, nicht beim Öffnen als Datei.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* ohne Service Worker geht die App trotzdem */ });
}
