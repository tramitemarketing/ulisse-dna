// Ricava la geometria delle forme A, B, Z da tre cristalli reali del PDB:
//   B: 1BNA (Drew, Dickerson et al. 1981)   A: 440D (d(AGGGGCCCCT), 1999)   Z: 1DCG (d(CGCGCG), 1.0 Å)
// Per ogni nucleotide: sistema di riferimento della base (sovrapposizione delle coordinate
// standard), coordinate dello scheletro in quel sistema, passo medio tra coppie, parametri elicoidali.
// Scrive src/forms.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "../src/math.js";
import { STD_BASES, BACKBONE_ATOMS } from "../src/data.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

function readPdb(id) {
  const res = new Map();
  for (const line of fs.readFileSync(path.join(root, "pdb", id + ".pdb"), "utf8").split(/\r?\n/)) {
    if (!line.startsWith("ATOM")) continue;
    const alt = line[16];
    if (alt !== " " && alt !== "A") continue;
    const name = line.slice(12, 16).trim();
    const resn = line.slice(17, 20).trim();
    const chain = line[21];
    const seq = parseInt(line.slice(22, 26));
    const xyz = [parseFloat(line.slice(30, 38)), parseFloat(line.slice(38, 46)), parseFloat(line.slice(46, 54))];
    const key = chain + seq;
    if (!res.has(key)) res.set(key, { chain, seq, base: resn.replace("D", ""), atoms: {} });
    res.get(key).atoms[name] = xyz;
  }
  return res;
}

function baseFrame(r) {
  const std = STD_BASES[r.base];
  const names = Object.keys(std).filter((n) => n !== "C1'" && r.atoms[n]);
  const fit = M.kabsch(names.map((n) => std[n]), names.map((n) => r.atoms[n]));
  return { R: fit.R, t: fit.t, rms: fit.rms };
}
const FLIP = [[1, 0, 0], [0, -1, 0], [0, 0, -1]];

function analyse(id, nbp) {
  const res = readPdb(id);
  const A = [...res.values()].filter((r) => r.chain === "A").sort((a, b) => a.seq - b.seq);
  const B = [...res.values()].filter((r) => r.chain === "B").sort((a, b) => a.seq - b.seq);
  if (A.length !== nbp || B.length !== nbp) throw new Error(id + ": numero di residui inatteso");
  const pairs = [];
  for (let k = 0; k < nbp; k++) pairs.push([A[k], B[nbp - 1 - k]]);
  const local = []; // scheletro di ogni nucleotide nel sistema della sua base
  let maxRms = 0;
  const bpFrames = pairs.map(([r1, r2]) => {
    const f1 = baseFrame(r1), f2 = baseFrame(r2);
    maxRms = Math.max(maxRms, f1.rms, f2.rms);
    for (const [r, f] of [[r1, f1], [r2, f2]]) {
      const inv = M.invert(f);
      const bb = {};
      for (const n of [...BACKBONE_ATOMS, "C1'"]) if (r.atoms[n]) bb[n] = M.apply(inv, r.atoms[n]);
      local.push({ base: r.base, chain: r.chain, seq: r.seq, bb });
    }
    const R2 = M.mmul(f2.R, FLIP);
    const R = M.averageRotation([f1.R, R2]);
    return { R, t: M.scale(M.add(f1.t, f2.t), 0.5), r1, r2 };
  });
  return { pairs, bpFrames, local, maxRms };
}

function avgTransform(list) {
  return { R: M.averageRotation(list.map((s) => s.R)), t: M.scale(list.map((s) => s.t).reduce(M.add, [0, 0, 0]), 1 / list.length) };
}
function step(F, i, j) { return M.compose(M.invert(F[i]), F[j]); }

function avgTemplate(entries, skipTerminal) {
  const out = {};
  for (const n of [...BACKBONE_ATOMS, "C1'"]) {
    const pts = entries.filter((e) => e.bb[n]).map((e) => e.bb[n]);
    if (!pts.length) continue;
    out[n] = M.scale(pts.reduce(M.add, [0, 0, 0]), 1 / pts.length).map((v) => +v.toFixed(3));
  }
  return out;
}

// Dal passo S2 (da una coppia "pari" alla successiva pari) ricava il sistema elicoidale.
function helical(S2) {
  const sc = M.screw(S2);
  const u = sc.u;
  const ex = [1, 0, 0];
  const xh = M.norm(M.sub(ex, M.scale(u, M.dot(ex, u))));
  const yh = M.cross(u, xh);
  const origin = M.sub(sc.c, M.scale(u, M.dot(sc.c, u)));
  const H0 = { R: M.fromCols(xh, yh, u), t: origin };
  const L = M.invert(H0); // posizione della coppia pari rispetto all'asse
  return { twist2: (sc.angle * 180) / Math.PI, rise2: sc.h, L };
}

function inner(n, lo, hi) { const a = []; for (let i = lo; i <= n - 1 - hi; i++) a.push(i); return a; }

const out = { source: {}, forms: {} };

// ---------- B (1BNA) e A (440D): passo singolo ----------
for (const [form, id, nbp] of [["B", "1BNA", 12], ["A", "440D", 10]]) {
  const an = analyse(id, nbp);
  const F = an.bpFrames.map((f) => ({ R: f.R, t: f.t }));
  const steps = inner(nbp - 1, 1, 1).map((i) => step(F, i, i + 1)); // salta i passi alle estremità
  const S = avgTransform(steps);
  const S2 = M.compose(S, S);
  const hel = helical(S2);
  // nucleotidi interni (escludi le estremità, dove lo scheletro è incompleto o deformato)
  const interior = an.local.filter((e) => e.bb.P && e.bb["O3'"]);
  const pur = interior.filter((e) => e.base === "A" || e.base === "G");
  const pyr = interior.filter((e) => e.base === "C" || e.base === "T");
  out.forms[form] = {
    pdb: id,
    stepTwist: hel.twist2 / 2, stepRise: hel.rise2 / 2,
    twist2: hel.twist2, rise2: hel.rise2,
    L: hel.L, M: S,
    templates: { pur: avgTemplate(pur), pyr: avgTemplate(pyr) },
    fitRms: an.maxRms,
    nStepsAveraged: steps.length,
  };
}

// ---------- Z (1DCG): unità di due coppie (CpG + GpC) ----------
{
  const an = analyse("1DCG", 6);
  const F = an.bpFrames.map((f) => ({ R: f.R, t: f.t }));
  // coppie 0,2,4 hanno C sul filamento I (C·G); 1,3,5 hanno G (G·C)
  const Ms = [step(F, 0, 1), step(F, 2, 3), step(F, 4, 5)]; // passi CpG
  const S2s = [step(F, 0, 2), step(F, 2, 4), step(F, 1, 3), step(F, 3, 5)].slice(0, 2);
  const Mz = avgTransform(Ms);
  const S2 = avgTransform(S2s);
  const hel = helical(S2);
  const all = an.local.filter((e) => e.bb.P && e.bb["O3'"]);
  out.forms.Z = {
    pdb: "1DCG",
    stepTwist: hel.twist2 / 2, stepRise: hel.rise2 / 2,
    twist2: hel.twist2, rise2: hel.rise2,
    L: hel.L, M: Mz,
    cpgTwist: (M.screw(Mz).angle * 180) / Math.PI,
    templates: { pyr: avgTemplate(all.filter((e) => e.base === "C")), pur: avgTemplate(all.filter((e) => e.base === "G")) },
    fitRms: an.maxRms,
  };
}

out.source = {
  B: "PDB 1BNA — Drew, Wing, Takano, Broka, Tanaka, Itakura & Dickerson (1981) PNAS 78:2179",
  A: "PDB 440D — d(AGGGGCCCCT), A-DNA ad alta risoluzione (1999)",
  Z: "PDB 1DCG — d(CGCGCG), Z-DNA a 1,0 Å (Gessner, Frederick, Quigley, Rich & Wang 1989)",
  basi: "Olson et al. (2001) J. Mol. Biol. 313:229 — sistema di riferimento standard delle coppie di basi",
};

fs.writeFileSync(path.join(root, "src", "forms.json"), JSON.stringify(out, null, 1));
for (const [k, f] of Object.entries(out.forms)) {
  console.log(k, f.pdb, "twist/bp", f.stepTwist.toFixed(2), "rise/bp", f.stepRise.toFixed(3), "bp/giro", (360 / Math.abs(f.stepTwist)).toFixed(2), "fitRms", f.fitRms.toFixed(3), f.cpgTwist ? "CpG twist " + f.cpgTwist.toFixed(1) : "");
}
