"use strict";
// Zeichenfläche für die Kanji-Abfrage und grober Abgleich mit den KanjiVG-Strichen.
// Kein perfekter Handschrifterkenner: verglichen werden Anzahl, Form, Lage, Richtung und Reihenfolge
// der Striche, nachdem Zeichnung und Vorlage auf gleiche Größe und Mitte gebracht wurden.
// Die Bewertung („Gewusst“/„Noch nicht“) bleibt bei der lernenden Person – die App schlägt nur vor.

const KanjiDraw = (() => {
  const BOX = 109;          // Koordinaten wie KanjiVG (viewBox 0 0 109 109)
  const N = 24;             // Punkte pro Strich für den Vergleich
  const OK = 0.17;          // mittlere Abweichung (Anteil der Zeichengröße), bis zu der ein Strich passt

  // ---------- Zeichenfläche ----------
  // el: leeres Element; onChange(strokes) nach jedem Strich. Striche in KanjiVG-Koordinaten.
  function pad(el, { strokes = [], onChange = () => {} } = {}) {
    el.innerHTML = `<canvas class="draw-canvas" aria-label="Zeichenfläche"></canvas>`;
    const canvas = el.firstElementChild;
    const ctx = canvas.getContext("2d");
    let current = null;

    function size() {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      redraw();
    }
    const scale = () => canvas.width / BOX;
    function toBox(e) {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * BOX, ((e.clientY - r.top) / r.height) * BOX];
    }
    function line(pts) {
      if (!pts.length) return;
      const s = scale();
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * s, pts[0][1] * s);
      if (pts.length === 1) ctx.lineTo(pts[0][0] * s + 0.1, pts[0][1] * s);
      for (const p of pts.slice(1)) ctx.lineTo(p[0] * s, p[1] * s);
      ctx.stroke();
    }
    function redraw() {
      const s = scale();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const css = getComputedStyle(el);
      // Hilfslinien wie bei der Strichfolge
      ctx.save();
      ctx.strokeStyle = css.getPropertyValue("--border").trim() || "#ccc";
      ctx.lineWidth = Math.max(1, s * 0.6);
      ctx.setLineDash([s * 2, s * 2]);
      ctx.beginPath();
      ctx.moveTo(BOX / 2 * s, 2 * s); ctx.lineTo(BOX / 2 * s, (BOX - 2) * s);
      ctx.moveTo(2 * s, BOX / 2 * s); ctx.lineTo((BOX - 2) * s, BOX / 2 * s);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = css.getPropertyValue("--text").trim() || "#222";
      ctx.lineWidth = 4.2 * s;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const st of strokes) line(st);
      if (current) line(current);
    }

    canvas.addEventListener("pointerdown", e => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      current = [toBox(e)];
      redraw();
    });
    canvas.addEventListener("pointermove", e => {
      if (!current) return;
      const p = toBox(e), last = current[current.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.8) return;
      current.push(p);
      redraw();
    });
    const end = () => {
      if (!current) return;
      strokes.push(current);
      current = null;
      redraw();
      onChange(strokes);
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    new ResizeObserver(size).observe(canvas);
    size();

    return {
      get strokes() { return strokes; },
      undo() { strokes.pop(); redraw(); onChange(strokes); },
      clear() { strokes.length = 0; redraw(); onChange(strokes); },
    };
  }

  // ---------- Vorlage in Punkte umrechnen ----------
  let probe = null;
  function refStrokes(paths) {
    if (!probe) {
      probe = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      probe.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden");
      probe.setAttribute("aria-hidden", "true");
      document.body.appendChild(probe);
    }
    return paths.map(d => {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      probe.appendChild(p);
      const len = p.getTotalLength();
      const pts = [];
      for (let i = 0; i < N; i++) { const q = p.getPointAtLength((len * i) / (N - 1)); pts.push([q.x, q.y]); }
      p.remove();
      return pts;
    });
  }

  // ---------- Vergleich ----------
  // Gleichmäßig verteilte Punkte entlang eines Strichs
  function resample(pts) {
    if (pts.length < 2) return Array.from({ length: N }, () => pts[0]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1];
    if (!total) return Array.from({ length: N }, () => pts[0]);
    const out = [];
    let j = 1;
    for (let i = 0; i < N; i++) {
      const t = (total * i) / (N - 1);
      while (j < pts.length - 1 && cum[j] < t) j++;
      const f = cum[j] === cum[j - 1] ? 0 : (t - cum[j - 1]) / (cum[j] - cum[j - 1]);
      out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f]);
    }
    return out;
  }
  // Ganzes Zeichen auf Mitte 0 und Größe 1 bringen (Seitenverhältnis bleibt)
  function normalize(strokes) {
    const all = strokes.flat();
    const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const size = Math.max(maxX - minX, maxY - minY, 1);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    return strokes.map(st => st.map(p => [(p[0] - cx) / size, (p[1] - cy) / size]));
  }
  const dist = (a, b) => a.reduce((s, p, i) => s + Math.hypot(p[0] - b[i][0], p[1] - b[i][1]), 0) / a.length;

  // Ergebnis: { strokes: [{ ok, reason }] je gezeichnetem Strich, userCount, refCount, inOrder, shape, verdict, text }
  function compare(userStrokes, paths) {
    const refCount = paths.length, userCount = userStrokes.length;
    if (!userCount) return null;
    const ref = normalize(refStrokes(paths)).map(resample);
    const usr = normalize(userStrokes).map(resample);

    // 1) Strich für Strich in der gezeichneten Reihenfolge
    const strokes = usr.map((u, i) => {
      if (i >= refCount) return { ok: false, reason: "zu viel" };
      const d = dist(u, ref[i]);
      if (d < OK) return { ok: true, reason: "" };
      if (dist([...u].reverse(), ref[i]) < OK) return { ok: false, reason: "Richtung" };
      const other = ref.findIndex((r, j) => j !== i && Math.min(dist(u, r), dist([...u].reverse(), r)) < OK);
      return { ok: false, reason: other >= 0 ? `Reihenfolge (ist Strich ${other + 1})` : "Form/Lage" };
    });
    const okCount = strokes.filter(s => s.ok).length;
    const inOrder = okCount === refCount && userCount === refCount;

    // 2) Form ohne Reihenfolge und Richtung: jeder Vorlagenstrich findet einen passenden gezeichneten
    const used = new Set();
    let matched = 0;
    for (const r of ref) {
      let best = -1, bestD = Infinity;
      usr.forEach((u, i) => {
        if (used.has(i)) return;
        const d = Math.min(dist(u, r), dist([...u].reverse(), r));
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best >= 0 && bestD < OK * 1.15) { used.add(best); matched++; }
    }
    // Bei vielen Strichen darf einer (ab 16 Strichen zwei) etwas daneben liegen
    const slack = Math.floor(refCount / 8);
    const shape = userCount === refCount && matched >= refCount - slack;

    let verdict, text;
    if (inOrder) { verdict = "good"; text = refCount === 1 ? "✓ Der Strich stimmt, auch die Richtung." : `✓ Alle ${refCount} Striche, Reihenfolge und Richtung stimmen.`; }
    else if (shape && matched === refCount) { verdict = "good"; text = `✓ Die Form stimmt. Reihenfolge oder Richtung weichen ab (${okCount} von ${refCount} Strichen genau).`; }
    else if (shape) { verdict = "good"; text = `✓ Fast perfekt: ${matched} von ${refCount} Strichen passen.`; }
    else if (userCount !== refCount) { verdict = matched / refCount >= 0.6 && Math.abs(userCount - refCount) <= 1 ? "close" : "again"; text = `${userCount} Striche gezeichnet, das Kanji hat ${refCount}. ${matched} passen.`; }
    else { verdict = matched / refCount >= 0.6 && refCount > 2 ? "close" : "again"; text = `${matched} von ${refCount} Strichen passen.`; }
    return { strokes, userCount, refCount, inOrder, shape, verdict, text };
  }

  // Zeichnung als SVG; passende Striche grün, abweichende rot (mit Nummer)
  function svg(userStrokes, result) {
    const lines = userStrokes.map((st, i) => {
      const cls = result ? (result.strokes[i].ok ? "ok" : "bad") : "";
      const pts = st.length > 1 ? st : [st[0], [st[0][0] + 0.1, st[0][1]]];
      return `<polyline class="${cls}" points="${pts.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ")}"/>`;
    }).join("");
    const nums = userStrokes.map((st, i) => `<text x="${(st[0][0] - 4).toFixed(1)}" y="${(st[0][1] - 2).toFixed(1)}">${i + 1}</text>`).join("");
    return `<svg viewBox="0 0 ${BOX} ${BOX}" class="kanji-svg drawn-svg" role="img" aria-label="Deine Zeichnung">
      <path class="grid" d="M54.5 2V107M2 54.5H107"/><g class="drawn">${lines}</g><g class="nums">${nums}</g></svg>`;
  }

  return { pad, compare, svg };
})();
