// Rifinisce lo scheletro (zucchero-fosfato) medio dei cristalli perché, su un'elica perfettamente
// regolare, il legame O3'–P tra nucleotidi vicini torni alla lunghezza vera (1,60 Å) con angoli
// corretti, cambiando il meno possibile la geometria del cristallo.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "../src/math.js";
import * as Mo from "../src/model.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "src", "forms.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const NAMES = ["P", "OP1", "OP2", "O5'", "C5'", "C4'", "O4'", "C3'", "O3'", "C2'"];

function refine(key, seq, unify) {
  const f = data.forms[key];
  if (!f.templatesCrystal) f.templatesCrystal = JSON.parse(JSON.stringify(f.templates));
  const crys = f.templatesCrystal;
  let start = crys;
  if (unify) {
    const avg = {};
    for (const n of [...NAMES, "C1'"]) avg[n] = M.scale(M.add(crys.pur[n], crys.pyr[n]), 0.5);
    start = { pur: avg, pyr: avg };
  }
  const classes = unify ? ["pur"] : ["pur", "pyr"];
  // vettore dei parametri
  const x = [];
  for (const c of classes) for (const n of NAMES) x.push(...start[c][n]);
  const unpack = (v) => {
    const t = {}; let k = 0;
    for (const c of classes) { t[c] = { "C1'": start[c]["C1'"] }; for (const n of NAMES) { t[c][n] = [v[k], v[k + 1], v[k + 2]]; k += 3; } }
    if (unify) t.pyr = t.pur;
    return t;
  };
  // distanze interne da preservare (dal cristallo)
  const intra = {};
  for (const c of classes) {
    const src = unify ? start.pur : crys[c];
    const all = [...NAMES, "C1'"];
    intra[c] = [];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const d = M.dist(src[all[i]], src[all[j]]);
      intra[c].push([all[i], all[j], d, d < 2.7 ? 1 : 0.15]);
    }
  }
  const p = Mo.formParams(key);
  const top = Mo.buildTopology(Mo.duplexStrands(seq), seq.length);
  const frames = Mo.bpFrames(p, seq.length);
  const pos = new Float32Array(top.atoms.length * 3);
  const links = top.bonds.filter((b) => b[2] === "link");
  const at = (i) => Mo.getPos(pos, i);
  const sibling = (i, name) => top.idx(top.atoms[i].strand, top.atoms[i].bp, name);
  const energy = (v) => {
    const tpl = unpack(v);
    p.tpl = tpl;
    Mo.computePositions(top, p, frames, pos);
    let E = 0;
    for (const [i, j] of links) {
      const O3 = at(i), P = at(j);
      E += 50 * (M.dist(O3, P) - 1.6) ** 2;
      E += 10 * (M.dist(at(sibling(i, "C3'")), P) - 2.61) ** 2;
      E += 10 * (M.dist(O3, at(sibling(j, "O5'"))) - 2.51) ** 2;
      E += 5 * (M.dist(O3, at(sibling(j, "OP1"))) - 2.49) ** 2;
      E += 5 * (M.dist(O3, at(sibling(j, "OP2"))) - 2.49) ** 2;
    }
    E /= links.length;
    for (const c of classes) for (const [a, b, d, w] of intra[c]) E += 2 * w * (M.dist(tpl[c][a], tpl[c][b]) - d) ** 2;
    for (const c of classes) for (const n of NAMES) E += 0.02 * M.dist(tpl[c][n], start[c][n]) ** 2;
    return E;
  };
  let E = energy(x), lr = 0.02;
  const g = new Array(x.length);
  for (let it = 0; it < 3000; it++) {
    for (let k = 0; k < x.length; k++) { const o = x[k]; x[k] = o + 1e-4; const e1 = energy(x); x[k] = o - 1e-4; const e0 = energy(x); x[k] = o; g[k] = (e1 - e0) / 2e-4; }
    const trial = x.map((v, k) => v - lr * g[k]);
    const Et = energy(trial);
    if (Et < E) { for (let k = 0; k < x.length; k++) x[k] = trial[k]; E = Et; lr *= 1.1; } else lr *= 0.5;
    if (lr < 1e-9) break;
  }
  const tpl = unpack(x);
  const round = (o) => Object.fromEntries(Object.entries(o).map(([n, v]) => [n, v.map((q) => +q.toFixed(3))]));
  f.templates = { pur: round(tpl.pur), pyr: round(tpl.pyr) };
  let maxMove = 0;
  for (const c of classes) for (const n of NAMES) maxMove = Math.max(maxMove, M.dist(tpl[c][n], start[c][n]));
  f.refineMaxMove = +maxMove.toFixed(3);
  console.log(key, "energia finale", E.toFixed(5), "spostamento massimo dal cristallo (Å)", maxMove.toFixed(3));
}

refine("B", "CGCGAATTCGCGAT", true);
refine("A", "AGGGGCCCCTAGGG", true);
refine("Z", "CGCGCGCGCGCGCG", false);
fs.writeFileSync(file, JSON.stringify(data, null, 1));
