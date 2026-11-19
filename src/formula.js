// Formula di struttura (2D) di una coppia di nucleotidi e formule brute.
// Le basi sono disegnate con le loro coordinate standard (sono piane): angoli e distanze sono veri.
import { STD_BASES, BASE_BONDS, HBONDS, BASE_INFO } from "./data.js";

// doppi legami (una forma di Kekulé) e idrogeni sugli atomi diversi dal carbonio
const DOUBLE = {
  A: ["C2-N3", "C4-C5", "C6-N1", "N7-C8"],
  G: ["C6-O6", "C2-N3", "C4-C5", "N7-C8"],
  C: ["C2-O2", "N3-C4", "C5-C6"],
  T: ["C2-O2", "C4-O4", "C5-C6"],
};
const HLAB = { A: { N6: "NH₂" }, G: { N1: "NH", N2: "NH₂" }, C: { N4: "NH₂" }, T: { N3: "NH", C7: "CH₃" } };
const RINGS = { pur: [["N1", "C2", "N3", "C4", "C5", "C6"], ["C4", "C5", "N7", "C8", "N9"]], pyr: [["N1", "C2", "N3", "C4", "C5", "C6"]] };
const isPur = (b) => b === "A" || b === "G";

export const NUCLEOTIDE = {
  A: { nome: "desossiadenosina monofosfato (dAMP)", f: { C: 10, H: 14, N: 5, O: 6, P: 1 }, base: { C: 5, H: 5, N: 5 } },
  G: { nome: "desossiguanosina monofosfato (dGMP)", f: { C: 10, H: 14, N: 5, O: 7, P: 1 }, base: { C: 5, H: 5, N: 5, O: 1 } },
  C: { nome: "desossicitidina monofosfato (dCMP)", f: { C: 9, H: 14, N: 3, O: 7, P: 1 }, base: { C: 4, H: 5, N: 3, O: 1 } },
  T: { nome: "desossitimidina monofosfato (dTMP)", f: { C: 10, H: 15, N: 2, O: 8, P: 1 }, base: { C: 5, H: 6, N: 2, O: 2 } },
};
const NUCLEOSIDE = { A: { C: 10, H: 13, N: 5, O: 3 }, G: { C: 10, H: 13, N: 5, O: 4 }, C: { C: 9, H: 13, N: 3, O: 4 }, T: { C: 10, H: 14, N: 2, O: 5 } };
const MASS = { C: 12.011, H: 1.008, N: 14.007, O: 15.999, P: 30.974 };
const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sub = (n) => (n === 1 ? "" : String(n).split("").map((d) => SUB[+d]).join(""));
export const formulaText = (f) => ["C", "H", "N", "O", "P"].filter((e) => f[e]).map((e) => e + sub(f[e])).join("");
export const molarMass = (f) => Object.entries(f).reduce((s, [e, n]) => s + MASS[e] * n, 0);

// Un filamento con estremità 5'-OH e 3'-OH: somma dei nucleosidi + (n-1) ponti fosfodiestere
// (nucleoside-OH + H3PO4 + HO-nucleoside − 2 H2O = +P +2 O −1 H per ogni ponte).
export function strandFormula(seq) {
  const f = { C: 0, H: 0, N: 0, O: 0, P: 0 };
  for (const b of seq) for (const [e, n] of Object.entries(NUCLEOSIDE[b])) f[e] += n;
  const links = seq.length - 1;
  f.P += links; f.O += 2 * links; f.H -= links;
  return f;
}
export function duplexFormula(seq, comp) {
  const a = strandFormula(seq), b = strandFormula(comp);
  const f = {};
  for (const e of Object.keys(a)) f[e] = a[e] + b[e];
  return f;
}

// --------- disegno SVG ---------
export function pairSVG(b1, b2) {
  // Sistema della coppia: x verso il solco maggiore, y verso il filamento I.
  // Sullo schermo: filamento I a destra (y → X), solco maggiore in alto (x → −Y).
  const S = 34; // pixel per Å
  const P = (x, y) => [y * S, -x * S];
  const atoms = {};
  const put = (strand, base, flip) => {
    for (const [n, c] of Object.entries(STD_BASES[base])) {
      const x = c[0], y = flip ? -c[1] : c[1];
      atoms[strand + n] = { n, el: n === "C7" ? "C" : n[0], p: P(x, y), base, strand };
    }
  };
  put("1", b1, false); put("2", b2, true);
  const out = [];
  const bb = [1e9, 1e9, -1e9, -1e9];
  const grow = (p, r = 0) => { bb[0] = Math.min(bb[0], p[0] - r); bb[1] = Math.min(bb[1], p[1] - r); bb[2] = Math.max(bb[2], p[0] + r); bb[3] = Math.max(bb[3], p[1] + r); };
  const line = (a, b, cls = "") => (grow(a, 6), grow(b, 6), out.push(`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" class="${cls}"/>`));
  const text = (p, s, cls = "", dx = 0, dy = 0) => (grow([p[0] + dx, p[1] + dy], cls === "link" ? 0 : 12), cls === "link" && (grow([p[0] + dx - s.length * 3, p[1] + dy]), grow([p[0] + dx + s.length * 3, p[1] + dy])), out.push(`<text x="${(p[0] + dx).toFixed(1)}" y="${(p[1] + dy).toFixed(1)}" class="${cls}">${s}</text>`));
  const labelled = (a) => a.el !== "C" || a.n === "C7";
  const shrink = (a, b, la, lb) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    const ra = la ? 12 : 0, rb = lb ? 12 : 0;
    return [[a[0] + (dx / L) * ra, a[1] + (dy / L) * ra], [b[0] - (dx / L) * rb, b[1] - (dy / L) * rb]];
  };
  const ringCentre = (strand, base, n1, n2) => {
    for (const r of RINGS[isPur(base) ? "pur" : "pyr"]) if (r.includes(n1) && r.includes(n2)) {
      const pts = r.map((n) => atoms[strand + n].p);
      return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    }
    return null;
  };
  // sfondo dei solchi

  // basi
  for (const [strand, base] of [["1", b1], ["2", b2]]) {
    const dbl = new Set(DOUBLE[base]);
    for (const [u, v] of BASE_BONDS[base]) {
      const A = atoms[strand + u], B = atoms[strand + v];
      if (u === "C1'" || v === "C1'") continue;
      const [a, b] = shrink(A.p, B.p, labelled(A), labelled(B));
      line(a, b, "bond " + base);
      if (dbl.has(`${u}-${v}`) || dbl.has(`${v}-${u}`)) {
        const c = ringCentre(strand, base, u, v);
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        let nx = -dy / L, ny = dx / L;
        if (c) { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; if ((c[0] - mx) * nx + (c[1] - my) * ny < 0) { nx = -nx; ny = -ny; } }
        const o = 5.5, t = c ? 0.16 : 0;
        const a2 = [a[0] + nx * o + dx * t, a[1] + ny * o + dy * t], b2 = [b[0] + nx * o - dx * t, b[1] + ny * o - dy * t];
        line(a2, b2, "bond " + base);
      }
    }
    for (const A of Object.values(atoms)) {
      if (A.strand !== strand || !labelled(A) || A.n === "C1'") continue;
      const h = HLAB[base][A.n];
      text(A.p, h || A.el, "atom el-" + A.el, 0, 7);
    }
  }
  // legami a idrogeno
  for (const [u, v] of HBONDS[b1 + b2]) {
    const [a, b] = shrink(atoms["1" + u].p, atoms["2" + v].p, true, true);
    line(a, b, "hbond");
  }
  // zuccheri (schema: desossiribosio con i numeri 1′–5′) e fosfati
  for (const [strand, base, sign] of [["1", b1, 1], ["2", b2, -1]]) {
    const c1 = atoms[strand + "C1'"].p, nG = atoms[strand + (isPur(base) ? "N9" : "N1")].p;
    const ux = c1[0] - nG[0], uy = c1[1] - nG[1], L = Math.hypot(ux, uy);
    const u = [ux / L, uy / L];
    const R = 1.22 * S;
    const centre = [c1[0] + u[0] * R, c1[1] + u[1] * R];
    const th0 = Math.atan2(c1[1] - centre[1], c1[0] - centre[0]);
    const v = (k) => [centre[0] + R * Math.cos(th0 + sign * k * 1.2566), centre[1] + R * Math.sin(th0 + sign * k * 1.2566)];
    const ring = [v(0), v(1), v(2), v(3), v(4)]; // C1', O4', C4', C3', C2'
    line(...shrink(nG, c1, true, false), "bond sugar");
    for (let k = 0; k < 5; k++) {
      const a = ring[k], b = ring[(k + 1) % 5];
      const [p, q] = shrink(a, b, k === 1, (k + 1) % 5 === 1);
      line(p, q, "bond sugar");
    }
    text(ring[1], "O", "atom el-O", 0, 5);
    const nums = ["1′", null, "4′", "3′", "2′"];
    nums.forEach((s, k) => { if (s) { const d = [ring[k][0] - centre[0], ring[k][1] - centre[1]]; const l = Math.hypot(...d); text(ring[k], s, "num", (d[0] / l) * 13, (d[1] / l) * 13 + 4); } });
    // C4' → C5'H2 → O → P
    const out4 = norm([ring[2][0] - centre[0], ring[2][1] - centre[1]]);
    const c5 = [ring[2][0] + out4[0] * 1.5 * S, ring[2][1] + out4[1] * 1.5 * S];
    line(ring[2], ...shrink(ring[2], c5, false, true).slice(1), "bond sugar");
    text(c5, "CH₂", "atom el-C", 0, 5);
    text(c5, "5′", "num", 0, -12);
    const o5 = [c5[0] + out4[0] * 1.25 * S, c5[1] + out4[1] * 1.25 * S];
    line(...shrink(c5, o5, true, true), "bond sugar");
    text(o5, "O", "atom el-O", 0, 5);
    const pP = [o5[0] + out4[0] * 1.25 * S, o5[1] + out4[1] * 1.25 * S];
    line(...shrink(o5, pP, true, true), "bond phos");
    text(pP, "P", "atom el-P", 0, 5);
    const perp = [-out4[1], out4[0]];
    for (const [d, s] of [[perp, "O"], [[-perp[0], -perp[1]], "O⁻"], [out4, "O"]]) {
      const q = [pP[0] + d[0] * 1.2 * S, pP[1] + d[1] * 1.2 * S];
      const [a, b] = shrink(pP, q, true, true);
      line(a, b, "bond phos");
      if (s === "O" && d === perp) { const n = [-d[1] * 4, d[0] * 4]; line([a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], "bond phos"); }
      text(q, s, "atom el-O", 0, 5);
    }
    const qq = [pP[0] + out4[0] * 1.2 * S, pP[1] + out4[1] * 1.2 * S];
    text(qq, strand === "1" ? "verso il nucleotide 5′" : "verso il nucleotide 5′", "link", out4[0] * 8, out4[1] * 8 + 18);
    // C3' → O3'
    const out3 = norm([ring[3][0] - centre[0], ring[3][1] - centre[1]]);
    const o3 = [ring[3][0] + out3[0] * 1.3 * S, ring[3][1] + out3[1] * 1.3 * S];
    line(...shrink(ring[3], o3, false, true), "bond sugar");
    text(o3, "O", "atom el-O", 0, 5);
    text(o3, "3′ → fosfato seguente", "link", out3[0] * 10, out3[1] * 10 + 18);
  }
  out.push(`<text x="0" y="${(bb[1] - 6).toFixed(0)}" class="groove">lato del solco maggiore ↑</text><text x="0" y="${(bb[3] + 18).toFixed(0)}" class="groove">↓ lato del solco minore</text>`);
  const pad = 14, x0 = bb[0] - pad, y0 = bb[1] - 26, w = bb[2] - bb[0] + 2 * pad, h = bb[3] - bb[1] + 52;
  return `<svg viewBox="${x0.toFixed(0)} ${y0.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}" class="formula" role="img" aria-label="Formula di struttura della coppia ${b1}-${b2}">${out.join("")}</svg>`;
}
function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }

export function formulaPanel(b1, b2) {
  const n1 = NUCLEOTIDE[b1], n2 = NUCLEOTIDE[b2];
  const row = (b, n) => `<tr><td><span class="sw ${b}"></span>${BASE_INFO[b].nome}</td><td>${formulaText(n.base)}</td><td>${formulaText(n.f)}</td><td>${molarMass(n.f).toFixed(1).replace(".", ",")}</td></tr>`;
  return `${pairSVG(b1, b2)}
  <p class="fnote">Formula di struttura: i vertici senza lettera sono atomi di <b>carbonio</b>, gli idrogeni legati al carbonio sono sottintesi. Le linee tratteggiate sono i <b>legami a idrogeno</b>. Il fosfato è disegnato con la carica negativa che ha nella cellula; formule e masse della tabella sono invece quelle dell'acido neutro.</p>
  <table class="ftable small"><tr><th>base</th><th>base libera</th><th>nucleotide (acido)</th><th>g/mol</th></tr>${row(b1, n1)}${row(b2, n2)}</table>
  <p class="fnote">${n1.nome[0].toUpperCase() + n1.nome.slice(1)} e ${n2.nome}. Nel filamento ogni nucleotide perde una molecola d'acqua quando si lega al successivo.</p>`;
}
