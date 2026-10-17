"use strict";
// Strichfolgen (KanjiVG): Blöcke zu 200 Rahmen werden bei Bedarf per <script> nachgeladen
// (funktioniert auch beim direkten Öffnen von index.html ohne Server).

const KanjiStrokes = (() => {
  const data = {};
  const loading = {};
  const BLOCK = 200;
  const pad = n => String(n).padStart(4, "0");

  function fileFor(frame) {
    const start = Math.floor((frame - 1) / BLOCK) * BLOCK + 1;
    return `data/strokes/${pad(start)}-${pad(start + BLOCK - 1)}.js`;
  }
  function add(obj) { Object.assign(data, obj); }
  function load(frame) {
    const file = fileFor(frame);
    if (!loading[file]) {
      loading[file] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = file;
        s.onload = resolve;
        s.onerror = () => { delete loading[file]; reject(new Error(`${file} nicht gefunden`)); };
        document.head.appendChild(s);
      });
    }
    return loading[file];
  }
  const get = kanji => data[kanji] || null;

  // Zeichnet das Kanji als SVG; animate = Striche nacheinander zeichnen
  function render(el, kanji, { animate = true, numbers = true } = {}) {
    const paths = get(kanji);
    if (!paths) { el.innerHTML = `<div class="kanji-fallback jp">${kanji}</div>`; return; }
    const nums = numbers ? paths.map((d, i) => {
      const m = d.match(/^[Mm]\s*([\d.]+)[ ,]([\d.]+)/);
      return m ? `<text x="${Number(m[1]) - 5}" y="${Number(m[2]) - 2}">${i + 1}</text>` : "";
    }).join("") : "";
    el.innerHTML = `
      <svg viewBox="0 0 109 109" class="kanji-svg" role="img" aria-label="${kanji}">
        <path class="grid" d="M54.5 2V107M2 54.5H107"/>
        <g class="ghost">${paths.map(d => `<path d="${d}"/>`).join("")}</g>
        <g class="ink">${paths.map(d => `<path d="${d}"/>`).join("")}</g>
        <g class="nums">${nums}</g>
      </svg>`;
    if (!animate) return;
    const ink = [...el.querySelectorAll(".ink path")];
    let delay = 0.15;
    for (const p of ink) {
      const len = p.getTotalLength();
      const dur = Math.max(0.25, len / 110);
      p.style.strokeDasharray = `${len} ${len}`;
      p.style.strokeDashoffset = len;
      p.style.transition = `stroke-dashoffset ${dur}s linear ${delay}s`;
      delay += dur + 0.12;
    }
    el.getBoundingClientRect(); // Reflow, damit der Übergang startet
    requestAnimationFrame(() => ink.forEach(p => { p.style.strokeDashoffset = 0; }));
  }

  return { add, load, get, render, fileFor };
})();
