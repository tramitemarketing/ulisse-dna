// Costruzione della molecola: topologia (atomi, legami) + posizioni per una forma data.
import * as M from "./math.js";
import FORMS from "./forms.json" with { type: "json" };
import { STD_BASES, BASE_BONDS, BACKBONE_ATOMS, BACKBONE_BONDS, HBONDS, COMPLEMENT, PURINES } from "./data.js";

export const FORM_DATA = FORMS.forms;
export const FORM_SOURCES = FORMS.source;
const FLIP = [[1, 0, 0], [0, -1, 0], [0, 0, -1]];

// ---------------- parametri di forma ----------------
export function formParams(key) {
  const f = FORM_DATA[key];
  return {
    key,
    twist2: f.twist2, rise2: f.rise2,
    Lq: M.quatFromMat(f.L.R), Lt: f.L.t.slice(),
    Mq: M.quatFromMat(f.M.R), Mt: f.M.t.slice(),
    tpl: f.templates,
  };
}
export function lerpParams(a, b, t) {
  const tpl = {};
  for (const cls of ["pur", "pyr"]) {
    tpl[cls] = {};
    for (const n of Object.keys(a.tpl[cls])) tpl[cls][n] = M.lerp(a.tpl[cls][n], b.tpl[cls][n] || a.tpl[cls][n], t);
  }
  return {
    key: t < 0.5 ? a.key : b.key,
    twist2: a.twist2 + (b.twist2 - a.twist2) * t,
    rise2: a.rise2 + (b.rise2 - a.rise2) * t,
    Lq: M.slerp(a.Lq, b.Lq, t), Lt: M.lerp(a.Lt, b.Lt, t),
    Mq: M.slerp(a.Mq, b.Mq, t), Mt: M.lerp(a.Mt, b.Mt, t),
    tpl,
  };
}

// Sistemi di riferimento delle coppie di basi, con l'asse dell'elica = asse z, centrati in z.
export function bpFrames(p, n) {
  const L = { R: M.matFromQuat(p.Lq), t: p.Lt };
  const Mm = { R: M.matFromQuat(p.Mq), t: p.Mt };
  const tw = (p.twist2 * Math.PI) / 180;
  const frames = [];
  for (let i = 0; i < n; i++) {
    const j = Math.floor(i / 2);
    const S = { R: M.rotZ(j * tw), t: [0, 0, j * p.rise2] };
    let F = M.compose(S, L);
    if (i % 2 === 1) F = M.compose(F, Mm);
    frames.push(F);
  }
  // centra lungo z
  const zc = (frames[0].t[2] + frames[n - 1].t[2]) / 2;
  for (const F of frames) F.t = [F.t[0], F.t[1], F.t[2] - zc];
  return frames;
}

// ---------------- topologia ----------------
// strands: [{ id, seq: array per coppia (lettera o null), flip, dir, daughter, kind }]
export function buildTopology(strands, nbp) {
  const atoms = []; // {name, el, strand, bp, base, cls, isBase, nt}
  const nts = [];
  const index = new Map(); // `${strand}|${bp}|${name}` -> atom
  for (let s = 0; s < strands.length; s++) {
    const st = strands[s];
    const order = [];
    for (let k = 0; k < nbp; k++) {
      const bp = st.dir > 0 ? k : nbp - 1 - k;
      if (st.seq[bp]) order.push(bp);
    }
    order.forEach((bp, k) => {
      const base = st.seq[bp];
      const is5 = k === 0;
      const nt = { strand: s, bp, base, cls: PURINES.has(base) ? "pur" : "pyr", start: atoms.length, is5, is3: k === order.length - 1, order: k };
      const add = (name, isBase) => {
        const el = name === "C7" ? "C" : name[0];
        index.set(`${s}|${bp}|${name}`, atoms.length);
        atoms.push({ name, el, strand: s, bp, base, cls: nt.cls, isBase, nt: nts.length });
      };
      for (const n of BACKBONE_ATOMS) {
        if (is5 && (n === "P" || n === "OP1" || n === "OP2") && !st.keep5P) continue;
        add(n, false);
      }
      for (const n of Object.keys(STD_BASES[base])) add(n, n !== "C1'");
      nt.end = atoms.length;
      nts.push(nt);
    });
  }
  const bonds = [];
  const idx = (s, bp, n) => index.get(`${s}|${bp}|${n}`);
  for (const nt of nts) {
    for (const [a, b] of [...BACKBONE_BONDS, ...BASE_BONDS[nt.base]]) {
      const i = idx(nt.strand, nt.bp, a), j = idx(nt.strand, nt.bp, b);
      if (i !== undefined && j !== undefined) bonds.push([i, j]);
    }
    const st = strands[nt.strand];
    const nextBp = nt.bp + st.dir;
    const j = idx(nt.strand, nextBp, "P"), i = idx(nt.strand, nt.bp, "O3'");
    if (i !== undefined && j !== undefined) bonds.push([i, j, "link"]);
  }
  return { atoms, nts, bonds, index, idx, strands, nbp };
}

// Legami a idrogeno tra due filamenti appaiati (filamento a "senso" I, b complementare)
export function hbondsBetween(top, sa, sb) {
  const out = [];
  for (let bp = 0; bp < top.nbp; bp++) {
    const ba = top.strands[sa].seq[bp], bb = top.strands[sb].seq[bp];
    if (!ba || !bb) continue;
    const key = ba + bb;
    const list = HBONDS[key];
    if (!list) continue;
    for (const [na, nb] of list) {
      const i = top.idx(sa, bp, na), j = top.idx(sb, bp, nb);
      if (i !== undefined && j !== undefined) out.push([i, j, bp]);
    }
  }
  return out;
}

export function duplexStrands(seq) {
  const s1 = seq.split("");
  const s2 = s1.map((b) => COMPLEMENT[b]);
  return [
    { id: "I", seq: s1, flip: false, dir: 1, daughter: 0, kind: "old" },
    { id: "II", seq: s2, flip: true, dir: -1, daughter: 0, kind: "old" },
  ];
}

// ---------------- posizioni ----------------
// frameFor(nt) -> {R,t} sistema della coppia (già spostato per le figlie nella replicazione)
export function computePositions(top, p, frames, out, frameFor) {
  const nts = top.nts;
  for (const nt of nts) {
    const st = top.strands[nt.strand];
    const F0 = frameFor ? frameFor(nt) : frames[nt.bp];
    const R = st.flip ? M.mmul(F0.R, FLIP) : F0.R;
    const t = F0.t;
    const tpl = p.tpl[nt.cls];
    const std = STD_BASES[nt.base];
    for (let a = nt.start; a < nt.end; a++) {
      const at = top.atoms[a];
      const loc = at.isBase || at.name === "C1'" ? std[at.name] : tpl[at.name];
      const x = R[0][0] * loc[0] + R[0][1] * loc[1] + R[0][2] * loc[2] + t[0];
      const y = R[1][0] * loc[0] + R[1][1] * loc[1] + R[1][2] * loc[2] + t[1];
      const z = R[2][0] * loc[0] + R[2][1] * loc[1] + R[2][2] * loc[2] + t[2];
      out[a * 3] = x; out[a * 3 + 1] = y; out[a * 3 + 2] = z;
    }
  }
  return out;
}

export const getPos = (pos, i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];

// ---------------- misure della molecola ----------------
export function measureModel(top, pos, frames, p) {
  const P1 = [], P2 = [];
  for (let bp = 0; bp < top.nbp; bp++) {
    const a = top.idx(0, bp, "P"), b = top.idx(1, bp, "P");
    if (a !== undefined) P1.push({ bp, i: a });
    if (b !== undefined) P2.push({ bp, i: b });
  }
  const radial = (i) => Math.hypot(pos[i * 3], pos[i * 3 + 1]);
  const rP = [...P1, ...P2].reduce((s, q) => s + radial(q.i), 0) / (P1.length + P2.length);
  // ingombro esterno: max distanza dall'asse + raggio di van der Waals
  let outer = 0;
  const vdw = { C: 1.7, N: 1.55, O: 1.52, P: 1.8 };
  for (let a = 0; a < top.atoms.length; a++) outer = Math.max(outer, radial(a) + vdw[top.atoms[a].el]);
  const stepTwist = p.twist2 / 2, stepRise = p.rise2 / 2;
  const bpPerTurn = 360 / Math.abs(stepTwist);
  // inclinazione media delle coppie rispetto all'asse
  let incl = 0;
  for (const F of frames) incl += (Math.acos(Math.min(1, Math.abs(F.R[2][2]))) * 180) / Math.PI;
  incl /= frames.length;
  // solchi (El Hassan & Calladine): distanza P-P minima attraverso il solco meno 5,8 Å
  const grooves = grooveWidths(top, pos, frames, P1, P2);
  // C1'-C1' e legami H della coppia centrale
  const mid = Math.floor(top.nbp / 2);
  const c1 = top.idx(0, mid, "C1'"), c2 = top.idx(1, mid, "C1'");
  const c1c1 = M.dist(getPos(pos, c1), getPos(pos, c2));
  return {
    handed: stepTwist > 0 ? "destrorsa" : "sinistrorsa",
    stepTwist, stepRise, bpPerTurn, pitch: bpPerTurn * stepRise,
    rP, diamP: 2 * rP, outer: 2 * outer, incl, c1c1, ...grooves,
  };
}

function grooveWidths(top, pos, frames, P1, P2) {
  if (P1.length < 8) return { minor: null, major: null };
  const res = { minor: null, major: null, minorPair: null, majorPair: null };
  const centre = P1[Math.floor(P1.length / 2)];
  const a = getPos(pos, centre.i);
  const d = P2.map((q) => ({ q, d: M.dist(a, getPos(pos, q.i)) }));
  for (let k = 1; k < d.length - 1; k++) {
    if (!(d[k].d <= d[k - 1].d && d[k].d <= d[k + 1].d)) continue;
    const b = getPos(pos, d[k].q.i);
    const m = M.scale(M.add(a, b), 0.5);
    // frame della coppia più vicina in altezza
    let F = frames[0], best = 1e9;
    for (const f of frames) { const dz = Math.abs(f.t[2] - m[2]); if (dz < best) { best = dz; F = f; } }
    const xdir = [F.R[0][0], F.R[1][0], 0];
    const radialDir = [m[0], m[1], 0];
    // il lato del solco maggiore è dove punta l'asse x delle coppie
    const isMajor = M.dot(xdir, radialDir) > 0;
    const w = d[k].d - 5.8;
    const key = isMajor ? "major" : "minor";
    if (res[key] === null || w < res[key]) { res[key] = w; res[key + "Pair"] = [centre.i, d[k].q.i]; }
  }
  return res;
}

// Controllo di qualità: lunghezze dei legami (usato dai test)
export function bondStats(top, pos) {
  let worst = 0, worstBond = null;
  for (const [i, j, kind] of top.bonds) {
    const L = M.dist(getPos(pos, i), getPos(pos, j));
    const dev = Math.abs(L - 1.5);
    if (L > 1.9 || L < 1.15) { if (dev > worst) { worst = dev; worstBond = [top.atoms[i].name, top.atoms[j].name, L.toFixed(2), kind || ""]; } }
  }
  return { worstBond };
}
