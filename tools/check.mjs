import * as Mo from "../src/model.js";
import * as M from "../src/math.js";
const show = (form, seq) => {
  const p = Mo.formParams(form);
  const top = Mo.buildTopology(Mo.duplexStrands(seq), seq.length);
  const fr = Mo.bpFrames(p, seq.length);
  const pos = new Float32Array(top.atoms.length * 3);
  Mo.computePositions(top, p, fr, pos);
  const m = Mo.measureModel(top, pos, fr, p);
  const links = top.bonds.filter(b => b[2] === "link").map(([i,j]) => M.dist(Mo.getPos(pos,i), Mo.getPos(pos,j)));
  const hb = [...Mo.hbondsBetween(top,0,1)].map(([i,j]) => M.dist(Mo.getPos(pos,i), Mo.getPos(pos,j)));
  // P-P intra
  const pp = [];
  for (let bp=1; bp<seq.length-1; bp++){ const a=top.idx(0,bp,"P"), b=top.idx(0,bp+1,"P"); if(a!==undefined&&b!==undefined) pp.push(M.dist(Mo.getPos(pos,a),Mo.getPos(pos,b)));}
  const f = (x)=> x==null? "-" : x.toFixed(2);
  console.log(form, seq.slice(0,12), "atoms", top.atoms.length, "|", m.handed, "bp/giro", f(m.bpPerTurn), "salita", f(m.stepRise), "passo", f(m.pitch), "rP", f(m.rP), "esterno", f(m.outer), "incl", f(m.incl), "C1'-C1'", f(m.c1c1), "minore", f(m.minor), "maggiore", f(m.major));
  console.log("   O3'-P link: min", f(Math.min(...links)), "max", f(Math.max(...links)), " Hbond min/max", f(Math.min(...hb)), f(Math.max(...hb)), " P-P intra", f(Math.min(...pp)), f(Math.max(...pp)), "worst bond", JSON.stringify(Mo.bondStats(top,pos).worstBond));
  // chirality check of sugar: signed volume at C4' (C3', O4', C5') vs crystal sign tested separately
};
show("B","CGCGAATTCGCGATGCATGCATGC");
show("A","AGGGGCCCCTAGGGGCCCCT");
show("Z","CGCGCGCGCGCGCGCGCGCGCGCG");
show("B","CGCGCGCGCGCGCGCGCGCGCGCG");
