// Disegno della molecola con three.js: tre rappresentazioni (libro, bastoncini, sfere piene).
import * as THREE from "three";
import { ELEMENTS, BASE_INFO } from "./data.js";

export const STRAND_COLORS = {
  old0: "#dcc9a6", // filamento I: carta d'osso
  old1: "#7fa3bd", // filamento II: acciaio
  oldGrey: "#767c88",
  new: "#ffa463",
  rna: "#f08ac0",
};

const RINGS = {
  pur: [["N1", "C2", "N3", "C4", "C5", "C6"], ["C4", "C5", "N7", "C8", "N9"]],
  pyr: [["N1", "C2", "N3", "C4", "C5", "C6"]],
};

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function setCyl(mesh, i, a, b, r) {
  _d.subVectors(b, a);
  const L = _d.length();
  if (L < 1e-6 || r <= 0) { mesh.setMatrixAt(i, ZERO); return; }
  _p.addVectors(a, b).multiplyScalar(0.5);
  _q.setFromUnitVectors(UP, _d.multiplyScalar(1 / L));
  _s.set(r, L, r);
  _m.compose(_p, _q, _s);
  mesh.setMatrixAt(i, _m);
}

export class MoleculeView {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.rep = "cartoon";
    this.colorMode = "base";
    this.showHB = true;
    this.showBackbone = true;
    this.showBases = true;
    this.dimOthers = null; // Set di bp da evidenziare
    this.sphereGeo = new THREE.SphereGeometry(1, 18, 12);
    this.cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false);
    this.mat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.05 });
    this.hbMat = new THREE.MeshStandardMaterial({ color: "#f3ecdd", emissive: "#6b5f4a", emissiveIntensity: 0.5, roughness: 0.6 });
    this.ringMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.0, transparent: true, opacity: 0.93 });
    this.tubeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1 });
    this.tubes = [];
  }

  setTopology(top, hbonds) {
    this.top = top;
    this.hbonds = hbonds;
    const nA = top.atoms.length, nB = top.bonds.length;
    for (const k of ["atomMesh", "bondMesh", "hbMesh", "ringMesh"]) if (this[k]) { this.group.remove(this[k]); this[k].geometry !== this.sphereGeo && this[k].geometry !== this.cylGeo && this[k].geometry.dispose(); }
    this.atomMesh = new THREE.InstancedMesh(this.sphereGeo, this.mat, nA);
    // per ogni legame: due metà + un connettore per nucleotide (modalità libro)
    this.bondMesh = new THREE.InstancedMesh(this.cylGeo, this.mat, nB * 2 + top.nts.length);
    this.hbMesh = new THREE.InstancedMesh(this.cylGeo, this.hbMat, Math.max(1, hbonds.length * 3));
    for (const m of [this.atomMesh, this.bondMesh, this.hbMesh]) { m.frustumCulled = false; this.group.add(m); }
    // anelli delle basi
    let nTri = 0;
    for (const nt of top.nts) for (const r of RINGS[nt.cls]) nTri += r.length;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nTri * 9), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(nTri * 9), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nTri * 9), 3));
    this.ringMesh = new THREE.Mesh(g, this.ringMat);
    this.ringMesh.frustumCulled = false;
    this.group.add(this.ringMesh);
    this.atomScale = new Float32Array(nA).fill(1);
    this.hbVisible = new Uint8Array(hbonds.length).fill(1);
    this.strandStyle = top.strands.map((s, i) => (s.kind === "old" ? (i === 0 ? "old0" : "old1") : "new"));
    this.ntRNA = new Uint8Array(top.nts.length);
    this.recolor();
  }

  atomColor(a) {
    const at = this.top.atoms[a];
    const nt = this.top.nts[at.nt];
    if (this.colorMode === "element") return ELEMENTS[at.el].colore;
    const sc = this.ntRNA[at.nt] ? STRAND_COLORS.rna : STRAND_COLORS[this.styleFor(at.strand)];
    if (this.colorMode === "strand") return sc;
    if (at.isBase) return BASE_INFO[this.ntRNA[at.nt] && nt.base === "T" ? "U" : nt.base].colore;
    if (at.name === "P" || at.name === "OP1" || at.name === "OP2") return this.colorMode === "age" ? sc : "#c99a64";
    return sc;
  }
  styleFor(strand) {
    const st = this.strandStyle[strand];
    if (this.colorMode === "age" && st !== "new") return "oldGrey";
    return st;
  }

  recolor() {
    const top = this.top;
    this.colors = new Float32Array(top.atoms.length * 3);
    for (let a = 0; a < top.atoms.length; a++) {
      _c.set(this.atomColor(a));
      const at = top.atoms[a];
      if (this.dimOthers && !this.dimOthers.has(at.bp)) _c.multiplyScalar(0.07);
      this.colors[a * 3] = _c.r; this.colors[a * 3 + 1] = _c.g; this.colors[a * 3 + 2] = _c.b;
      this.atomMesh.setColorAt(a, _c);
    }
    this.atomMesh.instanceColor.needsUpdate = true;
    let k = 0;
    for (const [i, j] of top.bonds) {
      this.bondMesh.setColorAt(k++, _c.setRGB(this.colors[i * 3], this.colors[i * 3 + 1], this.colors[i * 3 + 2]));
      this.bondMesh.setColorAt(k++, _c.setRGB(this.colors[j * 3], this.colors[j * 3 + 1], this.colors[j * 3 + 2]));
    }
    for (const nt of top.nts) {
      const c1 = top.idx(nt.strand, nt.bp, "C1'");
      this.bondMesh.setColorAt(k++, _c.setRGB(this.colors[c1 * 3], this.colors[c1 * 3 + 1], this.colors[c1 * 3 + 2]).lerp(new THREE.Color(this.atomColor(top.idx(nt.strand, nt.bp, "C4'"))), 0.0));
    }
    this.bondMesh.instanceColor.needsUpdate = true;
    if (this.pos) this.update(this.pos);
  }

  setRep(rep) { this.rep = rep; if (this.pos) this.update(this.pos); }
  setColorMode(m) { this.colorMode = m; this.recolor(); }
  setDim(set) { this.dimOthers = set; this.recolor(); }

  visible(a) { return this.atomScale[a] > 0.001; }
  layerOn(a) {
    const at = this.top.atoms[a];
    return at.isBase ? this.showBases : (at.name === "C1'" ? this.showBases || this.showBackbone : this.showBackbone);
  }

  update(pos) {
    this.pos = pos;
    const top = this.top, rep = this.rep;
    const V = (i, v) => v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    // --- atomi ---
    for (let a = 0; a < top.atoms.length; a++) {
      const at = top.atoms[a];
      let r = 0;
      if (rep === "bs") r = ELEMENTS[at.el].bs;
      else if (rep === "spacefill") r = ELEMENTS[at.el].vdw;
      r *= this.atomScale[a];
      if (!this.layerOn(a)) r = 0;
      if (r === 0) { this.atomMesh.setMatrixAt(a, ZERO); continue; }
      V(a, _p); _s.set(r, r, r); _q.identity();
      _m.compose(_p, _q, _s); this.atomMesh.setMatrixAt(a, _m);
    }
    this.atomMesh.instanceMatrix.needsUpdate = true;
    this.atomMesh.visible = rep !== "cartoon"; // nella vista «Libro» gli atomi non si disegnano
    // --- legami ---
    let k = 0;
    for (const [i, j] of top.bonds) {
      const ai = top.atoms[i], aj = top.atoms[j];
      let r = 0;
      const sc = Math.min(this.atomScale[i], this.atomScale[j]);
      if (rep === "bs") r = 0.14;
      else if (rep === "cartoon" && (ai.isBase || ai.name === "C1'") && (aj.isBase || aj.name === "C1'")) r = 0.17;
      if (!this.layerOn(i) || !this.layerOn(j)) r = 0;
      r *= sc > 0.001 ? 1 : 0;
      V(i, _a); V(j, _b); _p.addVectors(_a, _b).multiplyScalar(0.5);
      setCyl(this.bondMesh, k++, _a, _p, r);
      setCyl(this.bondMesh, k++, _p, _b, r);
    }
    // connettori base → scheletro (solo modalità libro)
    for (const nt of top.nts) {
      const c1 = top.idx(nt.strand, nt.bp, "C1'");
      let r = rep === "cartoon" && this.showBases && this.showBackbone && this.atomScale[c1] > 0.001 ? 0.32 : 0;
      const target = this.connectorTarget(nt, pos);
      V(c1, _a); _b.set(target[0], target[1], target[2]);
      setCyl(this.bondMesh, k++, _a, _b, r);
    }
    this.bondMesh.instanceMatrix.needsUpdate = true;
    // --- legami a idrogeno (tre trattini) ---
    let h = 0;
    for (let n = 0; n < this.hbonds.length; n++) {
      const [i, j] = this.hbonds[n];
      const on = this.showHB && this.showBases && rep !== "spacefill" && this.hbVisible[n] && this.atomScale[i] > 0.99 && this.atomScale[j] > 0.99;
      V(i, _a); V(j, _b);
      for (const [t0, t1] of [[0.12, 0.3], [0.41, 0.59], [0.7, 0.88]]) {
        const p0 = new THREE.Vector3().lerpVectors(_a, _b, t0), p1 = new THREE.Vector3().lerpVectors(_a, _b, t1);
        setCyl(this.hbMesh, h++, p0, p1, on ? 0.075 : 0);
      }
    }
    this.hbMesh.instanceMatrix.needsUpdate = true;
    // --- anelli ---
    this.updateRings(pos);
    // --- tubi dello scheletro ---
    this.updateTubes(pos);
  }

  connectorTarget(nt, pos) {
    const top = this.top;
    const st = top.strands[nt.strand];
    const pSelf = top.idx(nt.strand, nt.bp, "P") ?? top.idx(nt.strand, nt.bp, "O5'");
    const pNext = top.idx(nt.strand, nt.bp + st.dir, "P") ?? top.idx(nt.strand, nt.bp, "O3'");
    const useNext = pNext !== undefined && this.atomScale[pNext] > 0.99 ? pNext : top.idx(nt.strand, nt.bp, "O3'");
    return [
      (pos[pSelf * 3] + pos[useNext * 3]) / 2,
      (pos[pSelf * 3 + 1] + pos[useNext * 3 + 1]) / 2,
      (pos[pSelf * 3 + 2] + pos[useNext * 3 + 2]) / 2,
    ];
  }

  updateRings(pos) {
    const top = this.top;
    const P = this.ringMesh.geometry.attributes.position.array;
    const C = this.ringMesh.geometry.attributes.color.array;
    const N = this.ringMesh.geometry.attributes.normal.array;
    const show = this.rep === "cartoon" && this.showBases;
    let v = 0;
    const cen = new THREE.Vector3(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), nrm = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (const nt of top.nts) {
      const anyAtom = top.idx(nt.strand, nt.bp, "N1");
      const s = show ? this.atomScale[anyAtom] : 0;
      _c.setRGB(this.colors[anyAtom * 3], this.colors[anyAtom * 3 + 1], this.colors[anyAtom * 3 + 2]);
      for (const ring of RINGS[nt.cls]) {
        const ids = ring.map((n) => top.idx(nt.strand, nt.bp, n));
        cen.set(0, 0, 0);
        for (const i of ids) cen.x += pos[i * 3], cen.y += pos[i * 3 + 1], cen.z += pos[i * 3 + 2];
        cen.multiplyScalar(1 / ids.length);
        e1.set(pos[ids[0] * 3], pos[ids[0] * 3 + 1], pos[ids[0] * 3 + 2]).sub(cen);
        e2.set(pos[ids[2] * 3], pos[ids[2] * 3 + 1], pos[ids[2] * 3 + 2]).sub(cen);
        nrm.crossVectors(e1, e2).normalize();
        for (let q = 0; q < ids.length; q++) {
          const i = ids[q], j = ids[(q + 1) % ids.length];
          p0.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).sub(cen).multiplyScalar(s).add(cen);
          p1.set(pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]).sub(cen).multiplyScalar(s).add(cen);
          for (const pt of [cen, p0, p1]) {
            P[v] = pt.x; P[v + 1] = pt.y; P[v + 2] = pt.z;
            C[v] = _c.r; C[v + 1] = _c.g; C[v + 2] = _c.b;
            N[v] = nrm.x; N[v + 1] = nrm.y; N[v + 2] = nrm.z;
            v += 3;
          }
          if (s === 0) { for (let z = v - 9; z < v; z++) P[z] = 0; }
        }
      }
    }
    const g = this.ringMesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.normal.needsUpdate = true;
  }

  updateTubes(pos) {
    for (const t of this.tubes) { this.group.remove(t); t.geometry.dispose(); }
    this.tubes = [];
    if (this.rep !== "cartoon" || !this.showBackbone) return;
    const top = this.top;
    for (let s = 0; s < top.strands.length; s++) {
      const st = top.strands[s];
      const nts = top.nts.filter((n) => n.strand === s).sort((a, b) => a.order - b.order);
      // segmenti contigui di nucleotidi visibili
      let run = [];
      const flush = () => {
        if (run.length >= 2) this.addTube(run, pos);
        run = [];
      };
      let prevBp = null;
      for (const nt of nts) {
        const c1 = top.idx(s, nt.bp, "C1'");
        const vis = this.atomScale[c1] > 0.99;
        if (!vis || (prevBp !== null && nt.bp !== prevBp + st.dir)) flush();
        if (vis) { run.push(nt); prevBp = nt.bp; } else prevBp = null;
      }
      flush();
    }
  }

  addTube(run, pos) {
    const top = this.top;
    const pts = [], cols = [];
    const add = (i, nt) => {
      if (i === undefined) return;
      pts.push(new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
      const a = top.idx(nt.strand, nt.bp, "C4'");
      cols.push(new THREE.Color(this.colors[a * 3], this.colors[a * 3 + 1], this.colors[a * 3 + 2]));
    };
    const first = run[0], last = run[run.length - 1];
    add(top.idx(first.strand, first.bp, "P") === undefined ? top.idx(first.strand, first.bp, "O5'") : undefined, first);
    for (const nt of run) add(top.idx(nt.strand, nt.bp, "P"), nt);
    add(top.idx(last.strand, last.bp, "O3'"), last);
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const seg = pts.length * 8;
    const geo = new THREE.TubeGeometry(curve, seg, 0.95, 10, false);
    // colori per vertice lungo il tubo
    const cnt = geo.attributes.position.count;
    const colArr = new Float32Array(cnt * 3);
    const ring = 11;
    for (let v = 0; v < cnt; v++) {
      const u = Math.floor(v / ring) / seg;
      const c = cols[Math.min(cols.length - 1, Math.round(u * (cols.length - 1)))];
      colArr[v * 3] = c.r; colArr[v * 3 + 1] = c.g; colArr[v * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
    const mesh = new THREE.Mesh(geo, this.tubeMat);
    this.group.add(mesh);
    this.tubes.push(mesh);
  }

  // Selezione: atomo più vicino lungo un raggio (coordinate locali del gruppo)
  pick(rayLocal) {
    if (!this.pos) return null;
    const top = this.top, pos = this.pos;
    let best = null, bestT = Infinity;
    const o = rayLocal.origin, d = rayLocal.direction;
    for (let a = 0; a < top.atoms.length; a++) {
      if (!this.visible(a) || !this.layerOn(a)) continue;
      const at = top.atoms[a];
      let r = this.rep === "spacefill" ? ELEMENTS[at.el].vdw : this.rep === "bs" ? Math.max(0.55, ELEMENTS[at.el].bs * 1.6) : (at.isBase ? 0.9 : (at.name === "P" ? 1.3 : 0));
      if (r === 0) continue;
      const px = pos[a * 3] - o.x, py = pos[a * 3 + 1] - o.y, pz = pos[a * 3 + 2] - o.z;
      const t = px * d.x + py * d.y + pz * d.z;
      if (t < 0) continue;
      const d2 = px * px + py * py + pz * pz - t * t;
      if (d2 > r * r) continue;
      const tHit = t - Math.sqrt(r * r - d2);
      if (tHit < bestT) { bestT = tHit; best = a; }
    }
    return best;
  }
}
