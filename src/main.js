import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as Mo from "./model.js";
import { MoleculeView } from "./view.js";
import { Replication } from "./replication.js";
import { ScaleScene, LEVELS } from "./scale.js";
import { PRESETS, BASE_INFO, ELEMENTS, ATOM_ROLE, COMPLEMENT, PURINES, translate } from "./data.js";
import { formulaPanel, duplexFormula, formulaText, molarMass } from "./formula.js";
const icon = (id) => `<svg class="ico"><use href="#i-${id}"/></svg>`;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const fmt = (x, d = 2) => (x === null || x === undefined || !isFinite(x) ? "—" : x.toFixed(d).replace(".", ","));
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const isTouch = matchMedia("(pointer: coarse)").matches;
// avanzamento della schermata di caricamento (vedi index.html)
const loader = (text, p) => window.__loader?.set(p, text);
loader("Accendo il laboratorio", 0.3);

// ======================= renderer e scena =======================
const canvas = $("#c3d");
const stage = $("#stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const labelRenderer = new CSS2DRenderer({ element: $("#labels") });

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 6000);
camera.position.set(0, 18, 165);
scene.add(camera);
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x1b2036, 0.9);
scene.add(hemi);
// Luce principale: arriva da dove la porterebbe la camera (in alto a destra, davanti), ma sta
// sempre fuori dalla molecola e fa ombre morbide e leggere, che danno profondità alle forme.
const KEY_OFFSET = new THREE.Vector3(58, 62, 16); // più di lato: le ombre cadono dove si vedono
const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
scene.add(keyLight, keyLight.target);
keyLight.castShadow = true;
const anyTouch = matchMedia("(any-pointer: coarse)").matches;
keyLight.shadow.mapSize.set(anyTouch ? 1024 : 2048, anyTouch ? 1024 : 2048);
keyLight.shadow.intensity = 0.7;
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.06;
const _kd = new THREE.Vector3();
function updateKeyLight() {
  const pos = activeView().pos;
  let r2 = 0;
  if (pos) for (let i = 0; i < pos.length; i += 3) { const d = pos[i] * pos[i] + pos[i + 1] * pos[i + 1] + pos[i + 2] * pos[i + 2]; if (d > r2) r2 = d; }
  const R = Math.sqrt(r2) + 3; // raggio della molecola attorno al centro, più l'ingombro di un atomo
  _kd.copy(KEY_OFFSET).applyQuaternion(camera.quaternion).add(camera.position);
  if (_kd.lengthSq() < 1) _kd.set(0, 1, 0);
  keyLight.position.copy(_kd.normalize()).multiplyScalar(R + 40);
  const sc = keyLight.shadow.camera;
  if (Math.abs(sc.right - R) > 0.5) { sc.left = sc.bottom = -R; sc.right = sc.top = R; sc.near = 1; sc.far = 2 * R + 80; sc.updateProjectionMatrix(); }
}
const rim = new THREE.DirectionalLight(0x9db4ff, 0.6);
rim.position.set(-60, -20, -40);
camera.add(rim);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = 900;

const spin = new THREE.Group();
scene.add(spin);
const mol = new THREE.Group();
mol.rotation.x = -Math.PI / 2; // asse dell'elica (z del modello) → verticale
spin.add(mol);
const repGroup = new THREE.Group();
repGroup.rotation.x = -Math.PI / 2;
repGroup.visible = false;
spin.add(repGroup);

const dview = new MoleculeView(mol);
const rview = new MoleculeView(repGroup);
rview.colorMode = "age";

const scaleScene = new ScaleScene(renderer, canvas);

// ======================= stato =======================
const S = {
  mode: "esplora",
  seq: PRESETS[0].seq,
  refSeq: PRESETS[0].seq, // sequenza prima delle mutazioni
  form: "B",
  params: Mo.formParams("B"),
  spinSpeed: 0.22 * 1.2,
  ruler: false, rulerFirst: null,
  selBp: null,
  labels: true, axis: false,
  morph: null,
  flying: false,
  tween: null,
  rep: null, repT: 0, repPlaying: false, repSpeed: 1, repSeq: null,
  scalePlay: null,
  tour: null,
  showFormula: false,
  sym: true,
};

// ======================= utilità UI =======================
let toastTimer = null;
function toast(msg, ms = 3200) {
  const t = $("#toast");
  t.innerHTML = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}
function label(text, cls) {
  const el = document.createElement("div");
  el.className = "lbl " + cls;
  el.innerHTML = text;
  return new CSS2DObject(el);
}

// ======================= molecola =======================
const endLabels = [label("5′", "end"), label("3′", "end"), label("5′", "end"), label("3′", "end")];
const grooveLabels = [label("solco maggiore", "groove"), label("solco minore", "groove")];
for (const l of [...endLabels, ...grooveLabels]) mol.add(l);
const axisLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffe08a, dashSize: 2, gapSize: 1.4 }));
axisLine.visible = false;
mol.add(axisLine);

// ----- solchi: passando sopra (o toccando) la scritta, il solco si colora -----
const GROOVES = ["major", "minor"];
const GROOVE_NAME = { major: "solco maggiore", minor: "solco minore" };
const grooveFx = {};
// la passata velata mostra solo la metà del solco rivolta verso chi guarda, se no sembra una colonna piena
const grooveCZ = { value: 0 };
function frontOnly(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCZ = grooveCZ;
    sh.vertexShader = sh.vertexShader
      .replace("void main() {", "varying float vVZ;\nvoid main() {")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvVZ = mvPosition.z;");
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", "uniform float uCZ;\nvarying float vVZ;\nvoid main() {")
      .replace("#include <opaque_fragment>", "diffuseColor.a *= smoothstep(-1.0, 6.0, vVZ - uCZ);\n#include <opaque_fragment>");
  };
  return mat;
}
for (const k of GROOVES) {
  const color = k === "major" ? 0xffb14a : 0x5cc8ff;
  // due passate: quella piena dove il solco si vede, e una velata che traspare dagli atomi davanti
  const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }));
  const ghost = new THREE.Mesh(m.geometry, frontOnly(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, depthTest: false, side: THREE.DoubleSide })));
  m.visible = false; m.renderOrder = 5; m.frustumCulled = false;
  ghost.renderOrder = 6; ghost.frustumCulled = false;
  m.add(ghost);
  mol.add(m); grooveFx[k] = m;
}
// quali solchi sono fissati (clic o tocco) e quale è sotto il puntatore
const grooveState = { hover: null, pin: new Set() };
grooveLabels.forEach((l, i) => {
  const key = GROOVES[i], el = l.element;
  el.dataset.k = key;
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-pressed", "false");
  el.title = `Clicca o tocca per colorare il ${GROOVE_NAME[key]}`;
  const hover = (on) => { grooveState.hover = on ? key : grooveState.hover === key ? null : grooveState.hover; updateGrooves(); };
  el.addEventListener("pointerenter", () => hover(true));
  el.addEventListener("pointerleave", () => hover(false));
  el.addEventListener("focus", () => hover(true));
  el.addEventListener("blur", () => hover(false));
  el.addEventListener("click", () => { toggleGroove(key); });
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleGroove(key); } });
});
function toggleGroove(key, on) {
  const want = on ?? !grooveState.pin.has(key);
  if (want) grooveState.pin.add(key); else grooveState.pin.delete(key);
  updateGrooves();
}
// Una «grondaia» trasparente tra i due scheletri: va da un fosfato del filamento I a quello del
// filamento II che gli sta di fronte attraverso il solco, e scende verso l'asse in mezzo.
function grooveGeometry(key) {
  const pr = S.metrics?.[key + "Pair"];
  if (!pr) return null;
  const top = S.top, n = top.nbp;
  const off = top.atoms[pr[1]].bp - top.atoms[pr[0]].bp;
  const A = [], B = [];
  for (let k = 0; k < n; k++) {
    const i = top.idx(0, k, "P"), j = top.idx(1, k + off, "P");
    if (i === undefined || j === undefined) continue;
    A.push(atomV(i)); B.push(atomV(j));
  }
  if (A.length < 2) return null;
  const cA = new THREE.CatmullRomCurve3(A), cB = new THREE.CatmullRomCurve3(B);
  const NS = (A.length - 1) * 6 + 1, NU = 14;
  const verts = new Float32Array(NS * (NU + 1) * 3), index = [];
  const pa = new THREE.Vector3(), pb = new THREE.Vector3();
  const frames = S.frames;
  for (let s = 0; s < NS; s++) {
    const t = s / (NS - 1);
    cA.getPoint(t, pa); cB.getPoint(t, pb);
    const ta = Math.atan2(pa.y, pa.x), tb = Math.atan2(pb.y, pb.x);
    // da che parte girare: verso il solco giusto, cioè dove punta l'asse x della coppia a quell'altezza
    // (l'asse x delle coppie guarda il solco maggiore)
    const zm = (pa.z + pb.z) / 2;
    let F = frames[0], best = Infinity;
    for (const f of frames) { const dz = Math.abs(f.t[2] - zm); if (dz < best) { best = dz; F = f; } }
    const want = Math.atan2(F.R[1][0], F.R[0][0]) + (key === "major" ? 0 : Math.PI);
    let d = Math.atan2(Math.sin(tb - ta), Math.cos(tb - ta));
    const alt = d - Math.sign(d || 1) * 2 * Math.PI;
    if (Math.cos(ta + alt / 2 - want) > Math.cos(ta + d / 2 - want)) d = alt;
    const ra = Math.hypot(pa.x, pa.y), rb = Math.hypot(pb.x, pb.y);
    for (let u = 0; u <= NU; u++) {
      const f = u / NU, th = ta + d * f;
      // bordi appena fuori dai fosfati, centro che scende nel solco
      const r = (ra + (rb - ra) * f + 1.2) * (1 - 0.36 * Math.sin(Math.PI * f));
      const o = (s * (NU + 1) + u) * 3;
      verts[o] = r * Math.cos(th); verts[o + 1] = r * Math.sin(th); verts[o + 2] = pa.z + (pb.z - pa.z) * f;
    }
  }
  for (let s = 0; s < NS - 1; s++) for (let u = 0; u < NU; u++) {
    const a = s * (NU + 1) + u, b = a + NU + 1;
    index.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  g.setIndex(index);
  return g;
}
function updateGrooves() {
  const inMol = (S.mode === "esplora" || S.mode === "forme") && S.top && !S.flying;
  for (const [i, k] of GROOVES.entries()) {
    const on = inMol && (grooveState.pin.has(k) || grooveState.hover === k);
    const m = grooveFx[k];
    if (on) { const g = grooveGeometry(k) || new THREE.BufferGeometry(); m.geometry.dispose(); m.geometry = g; m.children[0].geometry = g; }
    m.visible = !!on;
    const el = grooveLabels[i].element;
    el.classList.toggle("on", !!on);
    el.setAttribute("aria-pressed", grooveState.pin.has(k) ? "true" : "false");
  }
}

// ----- maniglia in cima all'elica: trascinando si allunga o si accorcia, una coppia alla volta -----
const LEN_MIN = 4, LEN_MAX = 80;
const lenEl = document.createElement("div");
lenEl.className = "lenhandle";
lenEl.tabIndex = 0;
lenEl.setAttribute("role", "slider");
lenEl.setAttribute("aria-label", "Lunghezza della doppia elica, in coppie di basi");
lenEl.setAttribute("aria-valuemin", LEN_MIN);
lenEl.setAttribute("aria-valuemax", LEN_MAX);
lenEl.title = "Trascina su o giù per allungare o accorciare l'elica, una coppia alla volta (con la tastiera: frecce su e giù)";
lenEl.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-grip"/></svg><span class="lh-n"></span>`;
const lenHandle = new CSS2DObject(lenEl);
mol.add(lenHandle);

function buildDuplex() {
  const n = S.seq.length;
  S.top = Mo.buildTopology(Mo.duplexStrands(S.seq), n);
  S.hb = Mo.hbondsBetween(S.top, 0, 1);
  S.pos = new Float32Array(S.top.atoms.length * 3);
  dview.setTopology(S.top, S.hb);
  S.rulerFirst = null; updateFirstMark(); // gli atomi sono cambiati: il primo punto del righello si riprende
  if (S.selBp !== null && S.selBp >= n) S.selBp = null;
  dview.dimOthers = S.selBp !== null ? new Set([S.selBp]) : null;
  dview.recolor();
  measures.clear();
  updateGeometry();
  renderStrip();
  renderStats();
}

function updateGeometry() {
  S.frames = Mo.bpFrames(S.params, S.top.nbp);
  Mo.computePositions(S.top, S.params, S.frames, S.pos);
  dview.update(S.pos);
  S.metrics = Mo.measureModel(S.top, S.pos, S.frames, S.params);
  updateLabels();
  updateSymbols();
  measures.update();
  if (grooveFx.major.visible || grooveFx.minor.visible) updateGrooves();
}

function atomV(i, pos = S.pos) { return new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); }
function outward(v, d) { const r = Math.hypot(v.x, v.y) || 1; return new THREE.Vector3(v.x + (v.x / r) * d, v.y + (v.y / r) * d, v.z); }

function updateLabels() {
  const top = S.top, n = top.nbp;
  const show = S.labels && S.mode !== "replica";
  const ends = [
    [top.idx(0, 0, "O5'"), -1], [top.idx(0, n - 1, "O3'"), 1],
    [top.idx(1, n - 1, "O5'"), 1], [top.idx(1, 0, "O3'"), -1],
  ];
  ends.forEach(([i, dz], k) => {
    const v = outward(atomV(i), 4); v.z += dz * 3;
    endLabels[k].position.copy(v);
    endLabels[k].visible = show;
    endLabels[k].element.style.borderColor = k < 2 ? "#dcc9a6" : "#7fa3bd";
    endLabels[k].element.textContent = (k % 2 === 0 ? "5′" : "3′") + (k < 2 ? " · I" : " · II");
  });
  const m = S.metrics;
  [["majorPair", 0], ["minorPair", 1]].forEach(([key, k]) => {
    const pr = m[key];
    if (!pr || !show) { grooveLabels[k].visible = false; return; }
    const a = atomV(pr[0]), b = atomV(pr[1]);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const v = outward(mid, 9);
    grooveLabels[k].position.copy(v);
    grooveLabels[k].visible = true;
  });
  const z0 = S.frames[0].t[2] - 8, z1 = S.frames[n - 1].t[2] + 8;
  axisLine.geometry.setFromPoints([new THREE.Vector3(0, 0, z0), new THREE.Vector3(0, 0, z1)]);
  axisLine.computeLineDistances();
  axisLine.visible = S.axis && S.mode !== "replica";
  // maniglia della lunghezza, sopra la cima dell'elica
  lenHandle.position.set(0, 0, S.frames[n - 1].t[2] + 13);
  lenHandle.visible = (S.mode === "esplora" || S.mode === "forme") && !S.flying;
  lenEl.querySelector(".lh-n").textContent = `${n} coppie`;
  lenEl.setAttribute("aria-valuenow", n);
  lenEl.setAttribute("aria-valuetext", `${n} coppie di basi`);
}

// simboli chimici sugli atomi della coppia scelta (vista «Atomi»)
const symPool = [];
function updateSymbols() {
  const on = S.sym && S.selBp !== null && dview.rep === "bs" && (S.mode === "esplora" || S.mode === "forme") && S.top;
  let k = 0;
  if (on) {
    for (let a = 0; a < S.top.atoms.length; a++) {
      const at = S.top.atoms[a];
      if (at.bp !== S.selBp) continue;
      if (!dview.layerOn(a)) continue;
      if (!symPool[k]) { const l = label("", "atom"); mol.add(l); symPool.push(l); }
      const l = symPool[k++];
      l.element.textContent = at.el;
      l.element.style.color = ELEMENTS[at.el].colore;
      l.position.copy(atomV(a));
      l.visible = true;
    }
  }
  for (; k < symPool.length; k++) symPool[k].visible = false;
}

// ======================= misure =======================
class Measures {
  constructor(group) {
    this.group = group; this.items = []; this.uid = 0;
    this.cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xff7b3a, depthTest: false, transparent: true, opacity: 0.95 });
    this.dotGeo = new THREE.SphereGeometry(1, 12, 10);
    // linee guida tratteggiate, come nelle quote dei disegni tecnici
    this.guideMat = new THREE.LineDashedMaterial({ color: 0xff9a62, dashSize: 0.7, gapSize: 0.5, transparent: true, opacity: 0.75, depthTest: false });
    this.anchorMat = new THREE.MeshBasicMaterial({ color: 0xff9a62, transparent: true, opacity: 0.9, depthTest: false });
  }
  // guides: [puntoDoveArrivaDaA, puntoDoveArrivaDaB] (funzioni), per le misure che stanno fuori dall'elica
  add(a, b, caption, kind = "", guides = null) {
    const line = new THREE.Mesh(this.cylGeo, this.mat); line.renderOrder = 10;
    const d1 = new THREE.Mesh(this.dotGeo, this.mat), d2 = new THREE.Mesh(this.dotGeo, this.mat);
    d1.renderOrder = d2.renderOrder = 10;
    const lb = label("", "meas");
    const guide = new THREE.Group();
    if (guides) for (let k = 0; k < 2; k++) {
      const gl = new THREE.Line(new THREE.BufferGeometry(), this.guideMat); gl.renderOrder = 9;
      const an = new THREE.Mesh(this.dotGeo, this.anchorMat); an.renderOrder = 9; an.scale.setScalar(0.34);
      guide.add(gl, an);
    }
    this.group.add(line, d1, d2, lb, guide);
    const it = { id: ++this.uid, a, b, caption, kind, line, d1, d2, lb, guide, guides, preset: presetTag };
    this.items.push(it);
    this.update(); renderMeasureList();
    return it;
  }
  pt(e) { return e.atom !== undefined ? atomV(e.atom) : new THREE.Vector3(...e.fn()); }
  update() {
    for (const it of this.items) {
      const a = this.pt(it.a), b = this.pt(it.b);
      const d = b.clone().sub(a), L = d.length();
      it.L = L;
      it.line.position.copy(a).add(b).multiplyScalar(0.5);
      it.line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      it.line.scale.set(0.09, L, 0.09);
      it.d1.position.copy(a); it.d2.position.copy(b);
      it.d1.scale.setScalar(0.28); it.d2.scale.setScalar(0.28);
      it.lb.position.copy(it.line.position);
      if (it.guides) [a, b].forEach((p, k) => {
        const to = new THREE.Vector3(...it.guides[k]());
        const gl = it.guide.children[k * 2], an = it.guide.children[k * 2 + 1];
        gl.geometry.setFromPoints([p, to]); gl.computeLineDistances();
        an.position.copy(to);
      });
      const w = it.kind === "groove" ? `<small>larghezza ${fmt(L - 5.8, 1)} Å (P–P − 5,8)</small>` : "";
      it.lb.element.classList.toggle("compact", it.kind === "hb");
      it.lb.element.innerHTML = it.kind === "hb" ? `${fmt(L, 2)} Å` : `${fmt(L, 2)} Å · ${fmt(L / 10, 3)} nm${it.caption ? `<small>${it.caption}</small>` : ""}${w}`;
      const vis = S.mode !== "replica";
      for (const o of [it.line, it.d1, it.d2, it.lb, it.guide]) o.visible = vis;
    }
    if (this.items.length) renderMeasureList();
  }
  remove(id) {
    const k = this.items.findIndex((x) => x.id === id);
    if (k < 0) return;
    const it = this.items[k];
    this.group.remove(it.line, it.d1, it.d2, it.lb, it.guide);
    for (const o of it.guide.children) if (o.isLine) o.geometry.dispose();
    it.lb.element.remove();
    this.items.splice(k, 1);
    // tolta la misura di un solco, si spegne anche il suo colore
    if ((it.preset === "minor" || it.preset === "major") && !this.items.some((x) => x.preset === it.preset)) toggleGroove(it.preset, false);
    renderMeasureList();
  }
  clear() { for (const it of [...this.items]) this.remove(it.id); }
}
const measures = new Measures(mol);

function renderMeasureList() {
  for (const b of $$("#measurePresets [data-m]")) {
    const on = measures.items.some((it) => it.preset === b.dataset.m);
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  }
  const ul = $("#mlist");
  ul.innerHTML = measures.items.map((it) =>
    `<li><span>${it.caption || it.title || "distanza"}</span><span><b>${fmt(it.L, 2)} Å</b> <button data-del="${it.id}" title="Togli questa misura" aria-label="Togli">${icon("close")}</button></span></li>`).join("");
}
$("#mlist").addEventListener("click", (e) => { const id = e.target.closest("[data-del]")?.dataset.del; if (id) measures.remove(+id); });
$("#btnClearM").onclick = () => { measures.clear(); grooveState.pin.clear(); updateGrooves(); };

function atomDesc(i) {
  const at = S.top.atoms[i];
  return `${at.name} (${at.base}${at.bp + 1})`;
}

function midBp() { return Math.floor(S.top.nbp / 2); }
let presetTag = null; // quale misura pronta sta aggiungendo le righe (per rifarla se cambia la lunghezza)
function addPreset(kind, quiet = false) {
  presetTag = kind;
  try { addPresetInner(kind, quiet); } finally { presetTag = null; }
  if ((kind === "minor" || kind === "major") && S.metrics?.[kind + "Pair"]) toggleGroove(kind, true);
}
function addPresetInner(kind, quiet) {
  // in silenzio (quando si rifà dopo un cambio di lunghezza) niente avvisi e la camera resta dov'è
  const say = quiet ? () => {} : toast, focus = quiet ? () => {} : focusLocal, frame = quiet ? () => {} : () => frameAll();
  const top = S.top, m = S.metrics, n = top.nbp, c = midBp();
  const z = (bp) => S.frames[bp].t[2];
  const side = () => (m.rP + 6);
  // salita, giro e diametro stanno ad altezze diverse da quelle delle altre scritte (nomi dei solchi e misure
  // già fatte): così non si coprono, da qualunque lato si guardi. Si prende la coppia libera più vicina a quella preferita.
  const pickBp = (pref, off = 0) => {
    const taken = [...grooveLabels.filter((l) => l.visible).map((l) => l.position.z), ...measures.items.map((it) => it.lb.position.z)];
    const order = [...Array(n).keys()].filter((k) => k >= 1 && k <= n - 2).sort((a, b) => Math.abs(a - pref) - Math.abs(b - pref));
    for (const k of order) if (taken.every((q) => Math.abs(q - (z(k) + off)) > 9)) return k;
    return Math.max(1, Math.min(n - 2, pref));
  };
  const cRise = kind === "rise" ? pickBp(c + 7, Math.abs(m.stepRise) / 2) : 0;
  const cPitch = kind === "pitch" ? pickBp(c - 3) : 0;
  const cDiam = kind === "diam" ? pickBp(c - 9) : 0;
  if (kind === "rise") {
    const ctr = (bp) => () => S.frames[bp].t.slice(); // centro della coppia
    measures.add({ fn: () => [side(), 0, z(cRise)] }, { fn: () => [side(), 0, z(cRise + 1)] }, "salita tra due coppie", "", [ctr(cRise), ctr(cRise + 1)]);
    focus(new THREE.Vector3(side(), 0, z(cRise)), 40);
  } else if (kind === "pitch") {
    // il giro intero sta dal lato opposto alla salita, centrato a metà elica
    const z0 = z(cPitch) - S.metrics.pitch / 2;
    measures.add({ fn: () => [-side(), 0, z0] }, { fn: () => [-side(), 0, z0 + S.metrics.pitch] }, `un giro = ${fmt(S.metrics.bpPerTurn, 1)} coppie`, "", [() => [0, 0, z0], () => [0, 0, z0 + S.metrics.pitch]]);
    frame();
  } else if (kind === "diam") {
    const p = top.idx(0, cDiam, "P");
    measures.add({ atom: p }, { fn: () => { const v = atomV(p); return [-v.x, -v.y, v.z]; } }, "diametro tra i fosfati");
    frame();
  } else if (kind === "c1c1") {
    measures.add({ atom: top.idx(0, c, "C1'") }, { atom: top.idx(1, c, "C1'") }, "C1′–C1′, larghezza del «piolo»");
    focus(atomV(top.idx(0, c, "C1'")).add(atomV(top.idx(1, c, "C1'"))).multiplyScalar(0.5), 34);
  } else if (kind === "hbgc" || kind === "hbat") {
    const want = kind === "hbgc" ? ["G", "C"] : ["A", "T"];
    let bp = -1;
    for (let d = 0; d < n && bp < 0; d++) for (const k of [c + d, c - d]) if (k >= 0 && k < n && want.includes(S.seq[k]) && bp < 0) bp = k;
    if (bp < 0) { say(`In questa sequenza non c'è una coppia ${want.join("-")}.`); return; }
    for (const [i, j, b] of S.hb) if (b === bp) measures.add({ atom: i }, { atom: j }, `legame H ${S.top.atoms[i].name}···${S.top.atoms[j].name}`, "hb");
    focus(atomV(top.idx(0, bp, "C1'")).add(atomV(top.idx(1, bp, "C1'"))).multiplyScalar(0.5), 26);
  } else if (kind === "minor" || kind === "major") {
    const pr = m[kind + "Pair"];
    if (!pr) { say("Elica troppo corta per misurare i solchi."); return; }
    measures.add({ atom: pr[0] }, { atom: pr[1] }, kind === "minor" ? "solco minore" : "solco maggiore", "groove");
    frame();
  }
}
// le misure pronte sono interruttori: un clic la mette, un altro clic la toglie
$("#measurePresets").addEventListener("click", (e) => {
  const k = e.target.closest("[data-m]")?.dataset.m;
  if (!k) return;
  const mine = measures.items.filter((it) => it.preset === k);
  if (mine.length) for (const it of mine) measures.remove(it.id);
  else addPreset(k);
  renderMeasureList();
});

$("#btnRuler").onclick = () => setRuler(!S.ruler);
function setRuler(on) {
  S.ruler = on; S.rulerFirst = null;
  $("#btnRuler").classList.toggle("on", on);
  canvas.classList.toggle("ruler", on);
  dview.pickHints = on; dview.update(S.pos);
  updateFirstMark();
  $("#rulerHint").textContent = on
    ? (dview.rep === "cartoon" || dview.rep === "simple"
      ? "Clicca o tocca il primo punto: i fosfati sono i pallini sul nastro, e si possono prendere anche gli atomi delle basi."
      : "Clicca o tocca il primo atomo.")
    : "Premi il righello, poi clicca due atomi qualsiasi.";
  $("#btnRuler").lastChild.textContent = on ? "Fine misure" : "Misura tra due atomi";
  if (on && S.spinSpeed > 0) { setSpin(0); toast("Rotazione fermata per misurare con calma."); }
}

// ======================= vista: rappresentazione, colori, livelli =======================
const REP_HINT = {
  simple: `Solo lo scheletro e un bastoncino per ogni base: <b class="A">A</b> adenina, <b class="T">T</b> timina, <b class="G">G</b> guanina, <b class="C">C</b> citosina. Le purine (A, G) sono più lunghe delle pirimidine (T, C), così ogni piolo misura uguale.`,
  cartoon: "Come nei libri: scheletro a nastro e basi come anelli.",
  bs: "Ogni pallina è un atomo (gli idrogeni non si vedono, come nei cristalli ai raggi X).",
  spacefill: "Ogni atomo con il suo ingombro vero (raggio di van der Waals): così si vedono bene i solchi.",
};
// luce d'ambiente per vista: con le sfere piene serve meno luce diffusa, se no diventa un blocco unico
const REP_LIGHT = { simple: [0.5, 0.85], cartoon: [0.55, 0.9], bs: [0.5, 0.85], spacefill: [0.3, 0.55] };
function setRep(rep) {
  dview.setRep(rep); rview.setRep(rep);
  if (S.ruler) setRuler(true);
  $$("#segRep button").forEach((b) => { b.classList.toggle("on", b.dataset.rep === rep); b.setAttribute("aria-pressed", b.dataset.rep === rep ? "true" : "false"); });
  $("#repHint").innerHTML = REP_HINT[rep];
  [scene.environmentIntensity, hemi.intensity] = REP_LIGHT[rep];
  updateSymbols();
}
$("#segRep").addEventListener("click", (e) => { const r = e.target.dataset.rep; if (r) setRep(r); });
function setColor(m) { $("#selColor").value = m; dview.setColorMode(m); }
$("#selColor").onchange = (e) => setColor(e.target.value);
function setLayer(id, val) {
  const el = $(id); if (val !== undefined) el.checked = val;
  dview.showBackbone = $("#chkBackbone").checked;
  dview.showBases = $("#chkBases").checked;
  dview.showHB = $("#chkHB").checked;
  S.labels = $("#chkLabels").checked;
  S.axis = $("#chkAxis").checked;
  S.sym = $("#chkSym").checked;
  dview.update(S.pos);
  updateLabels();
  updateSymbols();
}
for (const id of ["#chkBackbone", "#chkBases", "#chkHB", "#chkLabels", "#chkAxis", "#chkSym"]) $(id).onchange = () => setLayer(id);
function setSpin(v) {
  $("#rngSpin").value = v;
  S.spinSpeed = (v / 100) * 1.2;
  if (v > 0) S.lastSpin = v;
  const word = v === 0 ? "ferma" : v < 25 ? "lenta" : v < 60 ? "media" : "veloce";
  $("#spinValue").textContent = word;
  const b = $("#btnSpin");
  b.innerHTML = v === 0 ? `${icon("play")}Falla girare` : `${icon("pause")}Fermala`;
}
$("#rngSpin").oninput = (e) => setSpin(+e.target.value);
$("#btnSpin").onclick = () => setSpin(S.spinSpeed > 0 ? 0 : S.lastSpin || 22);

// ======================= camera =======================
function worldOf(local, group = mol) { return group.localToWorld(local.clone()); }
function tweenTo(target, dist, dur = 0.9) {
  const dir = camera.position.clone().sub(controls.target).normalize();
  S.tween = { t: 0, dur, fromT: controls.target.clone(), toT: target.clone(), fromP: camera.position.clone(), toP: target.clone().addScaledVector(dir, dist) };
}
function focusLocal(local, dist = 30, group = mol) {
  if (S.spinSpeed > 0) setSpin(0);
  tweenTo(worldOf(local, group), dist);
}
function frameAll(group = mol, len) {
  const L = len ?? S.top.nbp * Math.abs(S.metrics?.stepRise || 3.3) + 30;
  const fit = (L / 2) / Math.tan((camera.fov * Math.PI) / 360) * 1.08;
  const aspectFix = camera.aspect < 1 ? 1 / camera.aspect * 0.75 : 1;
  const center = new THREE.Vector3(0, 0, 0);
  S.tween = { t: 0, dur: 1, fromT: controls.target.clone(), toT: center, fromP: camera.position.clone(), toP: new THREE.Vector3(0, L * 0.08, Math.max(60, fit * Math.max(1, aspectFix * 0.6))) };
}

// ======================= selezione / tooltip =======================
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let lastPointer = null, needPick = false, hoverAtom = null, downAt = null;
const hoverMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffc29a, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false }));
hoverMesh.renderOrder = 20;
const hoverHalo = new THREE.Mesh(hoverMesh.geometry, new THREE.MeshBasicMaterial({ color: 0xff7b3a, transparent: true, opacity: 0.2, depthWrite: false, depthTest: false }));
hoverHalo.scale.setScalar(1.6); hoverHalo.renderOrder = 19;
hoverMesh.add(hoverHalo);
hoverMesh.visible = false;
mol.add(hoverMesh);
// primo punto scelto col righello: resta segnato finché non si sceglie il secondo
const firstMark = new THREE.Mesh(hoverMesh.geometry, new THREE.MeshBasicMaterial({ color: 0xff7b3a, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false }));
firstMark.renderOrder = 21; firstMark.visible = false;
mol.add(firstMark);
function hoverRadius(v, at) {
  if (v.rep === "spacefill") return ELEMENTS[at.el].vdw * 1.1;
  if (v.rep === "bs") return Math.max(0.75, ELEMENTS[at.el].bs * 2.4);
  return at.name === "P" ? 1.6 : 0.85; // Libro e Semplice: il fosfato sta dentro il nastro, serve un segno più grande
}
function updateFirstMark() {
  const a = S.rulerFirst;
  firstMark.visible = a !== null && S.ruler;
  if (!firstMark.visible) return;
  firstMark.position.copy(atomV(a));
  firstMark.scale.setScalar(hoverRadius(dview, S.top.atoms[a]) * 0.8);
}

function localRay(e, group) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  group.updateMatrixWorld();
  const inv = group.matrixWorld.clone().invert();
  return raycaster.ray.clone().applyMatrix4(inv);
}
function activeView() { return S.mode === "replica" ? rview : dview; }
function activeGroup() { return S.mode === "replica" ? repGroup : mol; }

canvas.addEventListener("pointermove", (e) => { lastPointer = e; needPick = true; });
canvas.addEventListener("pointerleave", () => { lastPointer = null; needPick = true; });
let tapTimer = null;
canvas.addEventListener("pointerdown", (e) => {
  downAt = [e.clientX, e.clientY]; $("#panel").classList.remove("open");
  if (e.pointerType !== "mouse") { lastPointer = null; needPick = true; clearTimeout(tapTimer); }
});
canvas.addEventListener("pointerup", (e) => {
  if (!downAt || S.mode === "scala" || S.flying) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  // al tocco non c'è il «passa sopra»: un tocco fermo mostra la scheda dell'atomo, un trascinamento la nasconde
  if (e.pointerType !== "mouse") {
    lastPointer = moved > 10 ? null : e; needPick = true;
    clearTimeout(tapTimer);
    if (lastPointer) tapTimer = setTimeout(() => { if (lastPointer === e) { lastPointer = null; needPick = true; } }, 4000);
  }
  if (moved > 6) return;
  const v = activeView();
  const a = v.pick(localRay(e, activeGroup()));
  if (S.mode === "replica") return;
  if (S.ruler) {
    if (a === null) return;
    if (S.rulerFirst === null) { S.rulerFirst = a; updateFirstMark(); $("#rulerHint").textContent = `Primo punto: ${atomDesc(a)}. Ora clicca il secondo.`; }
    else if (a !== S.rulerFirst) {
      const it = measures.add({ atom: S.rulerFirst }, { atom: a }, `${atomDesc(S.rulerFirst)} → ${atomDesc(a)}`);
      S.rulerFirst = null; updateFirstMark();
      $("#rulerHint").textContent = `Misurato: ${fmt(it.L)} Å. Clicca altri due atomi o premi di nuovo il righello per finire.`;
    }
    return;
  }
  if (a !== null) selectBp(S.top.atoms[a].bp, false);
});
canvas.addEventListener("dblclick", (e) => {
  if (S.mode === "scala" || S.flying) return;
  const a = activeView().pick(localRay(e, activeGroup()));
  if (a !== null) {
    const v = activeView();
    focusLocal(new THREE.Vector3(v.pos[a * 3], v.pos[a * 3 + 1], v.pos[a * 3 + 2]), 22, activeGroup());
  }
});

function doPick() {
  needPick = false;
  const tip = $("#tooltip");
  if (!lastPointer || S.mode === "scala" || S.flying) { tip.hidden = true; hoverMesh.visible = false; return; }
  const v = activeView(), g = activeGroup();
  const a = v.pick(localRay(lastPointer, g));
  hoverAtom = a;
  if (a === null) { tip.hidden = true; hoverMesh.visible = false; return; }
  const top = v.top, at = top.atoms[a], nt = top.nts[at.nt];
  if (hoverMesh.parent !== g) g.add(hoverMesh);
  hoverMesh.position.set(v.pos[a * 3], v.pos[a * 3 + 1], v.pos[a * 3 + 2]);
  hoverMesh.scale.setScalar(hoverRadius(v, at));
  hoverMesh.visible = true;
  const st = top.strands[at.strand];
  const rna = v.ntRNA[at.nt] && nt.base === "T";
  const baseL = rna ? "U" : nt.base;
  const bi = BASE_INFO[baseL];
  const posInStrand = nt.order + 1;
  const role = at.isBase ? `atomo della base (${bi.nome})` : ATOM_ROLE[at.name] || "";
  const strandName = S.mode === "replica" ? `filamento ${st.kind === "old" ? "vecchio" : "nuovo"} ${st.id}` : `filamento ${st.id}`;
  tip.innerHTML = `<b><span class="el" style="background:${ELEMENTS[at.el].colore}"></span>${at.name}</b> · ${ELEMENTS[at.el].nome}<br><span class="t1">${role}</span><br>` +
    `<span class="sw ${baseL}"></span>${bi.nome}, ${bi.tipo}<br>${strandName} · nucleotide ${posInStrand} da 5′ · coppia ${at.bp + 1}` +
    (rna ? "<br><i>fa parte dell'innesco di RNA</i>" : "");
  const rr = stage.getBoundingClientRect();
  let x = lastPointer.clientX - rr.left + 16, y = lastPointer.clientY - rr.top + 16;
  tip.hidden = false;
  if (x + tip.offsetWidth > rr.width - 8) x = lastPointer.clientX - rr.left - tip.offsetWidth - 16;
  if (y + tip.offsetHeight > rr.height - 8) y = lastPointer.clientY - rr.top - tip.offsetHeight - 16;
  tip.style.left = x + "px"; tip.style.top = y + "px";
}

// ======================= sequenza e striscia =======================
function cleanSeq(s) { return s.toUpperCase().replace(/[\s\d\-_.,;]/g, ""); }
function setSequence(seq, opts = {}) {
  S.seq = seq;
  if (!opts.mutation) S.refSeq = seq;
  $("#txtSeq").value = seq;
  if (S.form === "Z" && !isZok(seq)) {
    S.form = "B"; S.params = Mo.formParams("B"); syncFormButtons();
    toast("La forma Z si forma solo con sequenze alternate C-G: torno alla forma B.");
  }
  if (!opts.keepSel) S.selBp = null;
  if (!opts.mutation) { S.lenTail = []; grooveState.pin.clear(); }
  buildDuplex();
  if (!opts.keepCam) frameAll();
  renderPairBox();
  updateGrooves();
  S.rep = null;
}
function isZok(seq) { return /^(CG)+$/.test(seq); }

// ----- lunghezza: allungare e accorciare dalla cima (estremità 3′ del filamento I) -----
S.lenTail = []; // lettere tolte accorciando: allungando di nuovo tornano le stesse
function lenStep() { return S.form === "Z" ? 2 : 1; } // la forma Z vuole coppie C-G alternate
function clampLen(n) { const st = lenStep(); return Math.max(LEN_MIN, Math.min(LEN_MAX, Math.round(n / st) * st)); }
function nextBase(seq) {
  if (S.form === "Z") return seq[seq.length - 1] === "C" ? "G" : "C";
  return "ACGT"[Math.floor(Math.random() * 4)];
}
function setLength(n) {
  const cur = S.seq.length;
  n = clampLen(n);
  if (n === cur) return false;
  let seq = S.seq;
  let ref = S.refSeq && S.refSeq.length === cur ? S.refSeq : seq;
  if (n > cur) {
    for (let k = cur; k < n; k++) {
      let pair = S.lenTail.pop();
      if (pair && S.form === "Z" && pair[0] !== nextBase(seq)) pair = null;
      const b = pair ? pair[0] : nextBase(seq);
      seq += b; ref += pair ? pair[1] : b;
    }
  } else {
    for (let k = cur - 1; k >= n; k--) S.lenTail.push([seq[k], ref[k]]);
    seq = seq.slice(0, n); ref = ref.slice(0, n);
  }
  // le misure sopravvivono: quelle pronte si rifanno, quelle col righello restano sugli stessi atomi
  const kept = measures.items.map((it) => ({
    preset: it.preset, caption: it.caption, kind: it.kind,
    ends: [it.a, it.b].map((e) => (e.atom !== undefined ? S.top.atoms[e.atom] : null)),
  }));
  S.seq = seq; S.refSeq = ref;
  $("#txtSeq").value = seq;
  sel.value = "custom";
  $("#presetNote").textContent = `Elica di ${n} coppie. Per cambiarla trascina la maniglia in cima all'elica.`;
  buildDuplex();
  const redo = new Set();
  for (const k of kept) {
    if (k.preset) { redo.add(k.preset); continue; }
    if (k.ends.some((a) => !a)) continue;
    const ids = k.ends.map((a) => (a.bp < n ? S.top.idx(a.strand, a.bp, a.name) : undefined));
    if (ids.every((i) => i !== undefined)) measures.add({ atom: ids[0] }, { atom: ids[1] }, k.caption, k.kind);
  }
  for (const p of redo) addPreset(p, true);
  renderPairBox();
  updateGrooves();
  S.rep = null;
  return true;
}
// dove cade un punto dell'elica sullo schermo (pixel della pagina) e se l'elica entra tutta nella vista
function toScreen(local) {
  const v = mol.localToWorld(local.clone()).project(camera);
  const r = canvas.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, ndc: v };
}
function helixFits() {
  const n = S.top.nbp;
  return [S.frames[0].t[2] - 10, S.frames[n - 1].t[2] + 16].every((z) => {
    const v = toScreen(new THREE.Vector3(0, 0, z)).ndc;
    return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1;
  });
}
function fitDistance() {
  const L = S.top.nbp * Math.abs(S.metrics?.stepRise || 3.3) + 30;
  const fit = (L / 2) / Math.tan((camera.fov * Math.PI) / 360) * 1.08;
  const aspectFix = camera.aspect < 1 ? 1 / camera.aspect * 0.75 : 1;
  return Math.max(60, fit * Math.max(1, aspectFix * 0.6));
}
// se prima si vedeva tutta, dopo il cambio la si rimette al centro, intera
function settleLength(wasFull) {
  if (!wasFull) return;
  const dist = Math.max(camera.position.distanceTo(controls.target), fitDistance());
  tweenTo(new THREE.Vector3(0, 0, 0), dist, 0.6);
}
let lenDrag = null;
lenEl.addEventListener("pointerdown", (e) => {
  if (e.button > 0 || !S.top) return;
  e.preventDefault(); e.stopPropagation();
  try { lenEl.setPointerCapture(e.pointerId); } catch (err) { /* qualche browser lo rifiuta: si trascina lo stesso */ }
  lenEl.focus({ preventScroll: true });
  controls.enabled = false;
  S.tween = null;
  const n0 = S.seq.length, rise = Math.abs(S.metrics?.stepRise || 3.38);
  const zTop = S.frames[n0 - 1].t[2];
  const a = toScreen(new THREE.Vector3(0, 0, zTop)), b = toScreen(new THREE.Vector3(0, 0, zTop + rise * 4));
  let ux = (b.x - a.x) / 4, uy = (b.y - a.y) / 4;
  let px = Math.hypot(ux, uy);
  if (px < 7) { ux = 0; uy = -7; px = 7; } // elica vista quasi dall'alto: basta muoversi in verticale
  lenDrag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, n0, ux: ux / px, uy: uy / px, px, rise, wasFull: helixFits() };
  lenEl.classList.add("drag");
  $("#tooltip").hidden = true;
});
lenEl.addEventListener("pointermove", (e) => {
  if (!lenDrag || e.pointerId !== lenDrag.id) return;
  const along = (e.clientX - lenDrag.x0) * lenDrag.ux + (e.clientY - lenDrag.y0) * lenDrag.uy;
  const before = S.seq.length;
  if (setLength(lenDrag.n0 + along / lenDrag.px)) {
    // la base dell'elica resta ferma sullo schermo e la cima segue il dito
    const dy = ((S.seq.length - before) * lenDrag.rise) / 2;
    camera.position.y -= dy; controls.target.y -= dy;
  }
});
function endLenDrag(e) {
  if (!lenDrag || (e && e.pointerId !== lenDrag.id)) return;
  const wasFull = lenDrag.wasFull;
  lenDrag = null;
  lenEl.classList.remove("drag");
  controls.enabled = S.mode !== "scala" && !S.flying;
  settleLength(wasFull);
}
lenEl.addEventListener("pointerup", endLenDrag);
lenEl.addEventListener("pointercancel", endLenDrag);
lenEl.addEventListener("lostpointercapture", endLenDrag);
lenEl.addEventListener("keydown", (e) => {
  const st = lenStep();
  const delta = { ArrowUp: st, ArrowRight: st, ArrowDown: -st, ArrowLeft: -st, PageUp: 5 * st, PageDown: -5 * st }[e.key];
  let n = null;
  if (delta) n = S.seq.length + delta;
  else if (e.key === "Home") n = LEN_MIN;
  else if (e.key === "End") n = LEN_MAX;
  if (n === null) return;
  e.preventDefault(); e.stopPropagation();
  const wasFull = helixFits();
  if (setLength(n) && wasFull && !helixFits()) settleLength(true);
});

const sel = $("#selPreset");
sel.innerHTML = PRESETS.map((p) => `<option value="${p.id}">${p.nome}</option>`).join("") + `<option value="custom">— la mia sequenza —</option>`;
sel.onchange = () => {
  const p = PRESETS.find((x) => x.id === sel.value);
  if (!p) return;
  $("#presetNote").textContent = p.nota;
  setSequence(p.seq);
  if (p.mutPos !== undefined) { S.refSeq = PRESETS[0].seq; renderStrip(); selectBp(p.mutPos, true); }
};
$("#presetNote").textContent = PRESETS[0].nota;
$("#btnApply").onclick = () => {
  const s = cleanSeq($("#txtSeq").value);
  const err = $("#seqError");
  if (!/^[ACGT]+$/.test(s)) { err.textContent = "Usa solo le lettere A, C, G, T."; return; }
  if (s.length < 4 || s.length > 80) { err.textContent = "Scrivi tra 4 e 80 lettere."; return; }
  err.textContent = ""; sel.value = "custom"; $("#presetNote").textContent = "";
  setSequence(s);
};
$("#btnRandom").onclick = () => {
  const n = 24; let s = ""; for (let i = 0; i < n; i++) s += "ACGT"[Math.floor(Math.random() * 4)];
  sel.value = "custom"; $("#presetNote").textContent = "Sequenza casuale di 24 basi.";
  setSequence(s);
};

function renderStats() {
  const s = S.seq, n = s.length;
  const gc = [...s].filter((b) => b === "G" || b === "C").length;
  const at = n - gc;
  const tm = n < 14 ? 2 * at + 4 * gc : 64.9 + (41 * (gc - 16.4)) / n;
  const ff = duplexFormula(s, [...s].map((b) => COMPLEMENT[b]).join(""));
  const rise = S.metrics?.stepRise || 3.34;
  const tmTitle = n < 14 ? "Temperatura di fusione con la regola di Wallace: 2·(A+T) + 4·(G+C)" : "Temperatura di fusione: 64,9 + 41·(G+C − 16,4)/N (stima per DNA in soluzione salina)";
  const tile = (k, v, title = "", cls = "") => `<div class="st${cls}"${title ? ` title="${title}"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`;
  $("#stats").innerHTML =
    tile("Coppie di basi", n) +
    tile("Contenuto G+C", `${fmt((100 * gc) / n, 0)} %`) +
    tile("Legami a idrogeno", `${2 * at + 3 * gc} <small>${at}×2 + ${gc}×3</small>`) +
    tile("Lunghezza", `${fmt((n * rise) / 10, 1)} nm`) +
    tile("Fusione (stima)", `≈ ${fmt(tm, 0)} °C`, "La temperatura a cui metà delle doppie eliche si separa in due filamenti. " + tmTitle) +
    tile("Massa molare", `${Math.round(molarMass(ff)).toLocaleString("it-IT")} g/mol`) +
    tile("Formula bruta di tutta la doppia elica", `<span class="formula">${formulaText(ff)}</span>`, "Quanti atomi di ogni elemento ci sono in tutta la molecola (acido neutro, idrogeni compresi)", " wide");
}

function renderStrip() {
  const s = S.seq, n = s.length, ref = S.refSeq;
  const focusBp = Math.min(n - 1, S.selBp ?? S.stripFocus ?? 0);
  const cells = [];
  const put = (html, cls, row, col, span = 1, data = "") => cells.push(`<div class="${cls}" style="grid-row:${row};grid-column:${col}${span > 1 ? " / span " + span : ""}" ${data}>${html}</div>`);
  put("", "end", 1, 1); put("5′", "end", 2, 1); put("", "end", 3, 1); put("3′", "end", 4, 1);
  for (let i = 0; i < n; i++) {
    const b = s[i], c = COMPLEMENT[b], col = i + 2;
    const mut = ref && ref.length === n && ref[i] !== b ? " mut" : "";
    const selc = S.selBp === i ? " sel" : "";
    put(i === 0 || (i + 1) % 5 === 0 ? i + 1 : "", "num", 1, col);
    put(b, `b ${b}${mut}${selc}`, 2, col, 1, `data-bp="${i}" role="button" tabindex="${i === focusBp ? 0 : -1}" aria-pressed="${S.selBp === i}" aria-label="coppia ${i + 1}: ${b} con ${c}" title="coppia ${i + 1}: ${b}-${c}"`);
    put(b === "G" || b === "C" ? "┆┆┆" : "┆┆", "hb", 3, col);
    put(c, `b ${c}${mut}${selc}`, 4, col, 1, `data-bp="${i}" aria-hidden="true" title="coppia ${i + 1}: ${b}-${c}"`);
  }
  put("3′", "end", 2, n + 2); put("5′", "end", 4, n + 2);
  for (let i = 0; i + 3 <= n; i += 3) {
    const cod = s.slice(i, i + 3), aa = translate(cod);
    const refCod = ref && ref.length === n ? ref.slice(i, i + 3) : cod;
    const changed = refCod !== cod;
    put(`${cod} <b>${aa.sigla}</b>`, "cod" + (changed ? " changed" : ""), 5, i + 2, 3, `title="codone ${i / 3 + 1}: ${cod} → ${aa.nome}"`);
  }
  const hadFocus = document.activeElement?.closest?.("#stripScroll");
  $("#stripScroll").innerHTML = `<div class="seqgrid" style="grid-template-columns:auto repeat(${n},var(--cell)) auto">${cells.join("")}</div>`;
  if (hadFocus) $(`#stripScroll [data-bp="${focusBp}"][tabindex]`)?.focus({ preventScroll: true });
}
$("#stripScroll").addEventListener("keydown", (e) => {
  const cell = e.target.closest("[data-bp][tabindex]");
  if (!cell) return;
  const n = S.seq.length, bp = +cell.dataset.bp;
  const to = { ArrowRight: bp + 1, ArrowLeft: bp - 1, Home: 0, End: n - 1 }[e.key];
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectBp(bp, true); return; }
  if (to === undefined) return;
  e.preventDefault();
  const k = Math.max(0, Math.min(n - 1, to));
  S.stripFocus = k;
  cell.tabIndex = -1;
  const next = $(`#stripScroll [data-bp="${k}"][tabindex]`);
  next.tabIndex = 0; next.focus();
  next.scrollIntoView({ block: "nearest", inline: "nearest" });
});
$("#stripScroll").addEventListener("click", (e) => {
  const bp = e.target.dataset.bp;
  if (bp !== undefined) selectBp(+bp, true);
});

function selectBp(bp, focus) {
  if (S.selBp === bp && !focus) { S.selBp = null; dview.setDim(null); renderStrip(); renderPairBox(); updateSymbols(); return; }
  S.selBp = bp;
  dview.setDim(new Set([bp]));
  renderStrip(); renderPairBox(); updateSymbols();
  const cell = $(`#stripScroll [data-bp="${bp}"]`);
  const sc = $("#stripScroll");
  if (cell) sc.scrollTo({ left: cell.offsetLeft - sc.clientWidth / 2, behavior: "smooth" });
  if (focus) {
    const c = atomV(S.top.idx(0, bp, "C1'")).add(atomV(S.top.idx(1, bp, "C1'"))).multiplyScalar(0.5);
    focusLocal(c, 30);
  }
}

function mutationReport(i, from, to) {
  const pur = (b) => PURINES.has(b);
  const type = pur(from) === pur(to) ? "transizione (purina↔purina o pirimidina↔pirimidina: la più frequente)" : "trasversione (purina↔pirimidina)";
  const hbFrom = from === "G" || from === "C" ? 3 : 2, hbTo = to === "G" || to === "C" ? 3 : 2;
  const ci = Math.floor(i / 3) * 3;
  let eff = "La lettera è fuori dai codoni completi.";
  if (ci + 3 <= S.seq.length) {
    const oldC = S.refSeq.slice(ci, ci + 3), newC = S.seq.slice(ci, ci + 3);
    const a = translate(oldC), b = translate(newC);
    if (a.lettera === b.lettera) eff = `Codone ${ci / 3 + 1}: ${oldC} → ${newC}, sempre <b>${a.sigla}</b>: mutazione <b>silente</b> (il codice genetico è ridondante).`;
    else if (b.lettera === "*") eff = `Codone ${ci / 3 + 1}: ${oldC} → ${newC}: ${a.sigla} diventa <b>STOP</b>. Mutazione <b>non senso</b>: la proteina si interrompe qui.`;
    else eff = `Codone ${ci / 3 + 1}: ${oldC} → ${newC}: ${a.nome} (${a.sigla}) diventa <b>${b.nome} (${b.sigla})</b>. Mutazione <b>di senso</b> (missenso).`;
  }
  const hb = hbFrom === hbTo ? `La coppia ha sempre ${hbTo} legami a idrogeno.` : `La coppia passa da ${hbFrom} a ${hbTo} legami a idrogeno.`;
  if (S.refSeq.startsWith("ATGGTGCATCTG") && ci >= 3) eff += ` <br><span style="opacity:.8">Nei testi di medicina è il codone ${ci / 3}: la numerazione della β-globina non conta la metionina iniziale (ATG), che viene tolta dalla proteina matura.</span>`;
  return `<b>Mutazione puntiforme</b> in posizione ${i + 1}: ${from}→${to}, una ${type}. ${hb}<br>${eff}`;
}

function renderPairBox() {
  const box = $("#pairbox");
  if (S.selBp === null || S.mode !== "esplora" && S.mode !== "forme") { box.hidden = true; return; }
  const i = S.selBp, b = S.seq[i], c = COMPLEMENT[b];
  const hb = b === "G" || b === "C" ? 3 : 2;
  const ci = Math.floor(i / 3) * 3;
  const cod = ci + 3 <= S.seq.length ? S.seq.slice(ci, ci + 3) : null;
  const ref = S.refSeq[i];
  const changed = S.refSeq.length === S.seq.length && ref !== b;
  box.innerHTML = `<button class="icon-btn close" title="Chiudi" aria-label="Chiudi">${icon("close")}</button>
    <h3 class="drag-h" title="Trascina per spostare la scheda"><span class="grip" aria-hidden="true"></span>Coppia ${i + 1} · <span class="pairglyph"><span class="${b}">${b}</span>${hb === 3 ? "≡" : "="}<span class="${c}">${c}</span></span> · ${hb} legami a idrogeno</h3>
    <div>Filamento I: <b>${BASE_INFO[b].nome}</b> (${BASE_INFO[b].tipo}) · filamento II: <b>${BASE_INFO[c].nome}</b> (${BASE_INFO[c].tipo})</div>
    ${cod ? `<div>Fa parte del codone ${ci / 3 + 1}: <b>${cod}</b> → ${translate(cod).nome}</div>` : ""}
    <div class="mutbtns">Cambia la base: ${"ATGC".split("").map((x) => `<button data-mut="${x}" class="base ${x}" ${x === b ? "disabled" : ""} aria-label="Metti ${BASE_INFO[x].nome}">${x}</button>`).join("")}
    ${S.refSeq !== S.seq ? `<button class="btn ghost small" data-undo="1">Annulla le mutazioni</button>` : ""}</div>
    ${changed ? `<div class="mutres">${mutationReport(i, ref, b)}</div>` : ""}
    <div class="tools"><button class="btn small ${S.showFormula ? "on" : ""}" data-formula="1">${icon("flask")}${S.showFormula ? "Nascondi la formula" : "Formula chimica"}</button></div>
    ${S.showFormula ? `<div class="formula-wrap">${formulaPanel(b, c)}</div>` : ""}`;
  box.hidden = false;
  arrangeOverlays();
}

// ----- finestre sopra la scena: non si coprono, e si possono spostare col dito o col mouse -----
const capState = { dx: 0, dy: 0, moved: false }, pairState = { dx: 0, dy: 0, moved: false };
function resetDrag(el, st) { st.dx = st.dy = 0; st.moved = false; el.style.translate = ""; }
function makeDraggable(el, handleSel, st) {
  let d = null;
  el.addEventListener("pointerdown", (e) => {
    const h = e.target.closest(handleSel);
    if (!h || e.button > 0 || e.target.closest("button, a, input, select, textarea")) return;
    e.preventDefault();
    d = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: st.dx, dy: st.dy, r: el.getBoundingClientRect() };
    try { h.setPointerCapture(e.pointerId); } catch (err) { /* si trascina lo stesso */ }
    el.classList.add("dragging");
  });
  el.addEventListener("pointermove", (e) => {
    if (!d || e.pointerId !== d.id) return;
    // la finestra resta sempre dentro lo schermo
    const mx = Math.max(4 - d.r.left, Math.min(innerWidth - 4 - d.r.right, e.clientX - d.x));
    const my = Math.max(4 - d.r.top, Math.min(innerHeight - 4 - d.r.bottom, e.clientY - d.y));
    st.dx = d.dx + mx; st.dy = d.dy + my; st.moved = true;
    el.style.translate = `${st.dx}px ${st.dy}px`;
  });
  const end = (e) => { if (!d || (e && e.pointerId !== d.id)) return; d = null; el.classList.remove("dragging"); };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("lostpointercapture", end);
}
makeDraggable($("#caption"), ".cap-head", capState);
makeDraggable($("#pairbox"), ".drag-h", pairState);
// se la didascalia e la scheda della coppia si toccherebbero, la scheda si accorcia (e scorre dentro);
// sul telefono la didascalia sale in alto. Se qualcuno le ha spostate a mano, si lasciano dove sono.
function arrangeOverlays() {
  const cap = $("#caption"), box = $("#pairbox");
  box.style.maxHeight = "";
  cap.classList.remove("dock-top");
  if (box.hidden) resetDrag(box, pairState);
  if (cap.hidden) resetDrag(cap, capState);
  if (cap.hidden || box.hidden || capState.moved || pairState.moved) return;
  if (stage.clientWidth <= 860) cap.classList.add("dock-top");
  const a = cap.getBoundingClientRect(), b = box.getBoundingClientRect();
  if (a.left < b.right && b.left < a.right && b.top < a.bottom + 12) box.style.maxHeight = Math.max(160, b.bottom - a.bottom - 12) + "px";
}
$("#capMin").onclick = () => {
  const cap = $("#caption"), min = !cap.classList.contains("min");
  cap.classList.toggle("min", min);
  $("#capMin").setAttribute("aria-expanded", min ? "false" : "true");
  $("#capMin").setAttribute("aria-label", min ? "Riapri la didascalia" : "Riduci la didascalia");
  $("#capMin").textContent = min ? "+" : "−";
  arrangeOverlays();
};
new ResizeObserver(() => arrangeOverlays()).observe(stage);
$("#pairbox").addEventListener("click", (e) => {
  const t = e.target.closest("button") || e.target;
  if (t.dataset.formula) { S.showFormula = !S.showFormula; renderPairBox(); return; }
  if (t.classList.contains("close")) { S.selBp = null; dview.setDim(null); renderStrip(); renderPairBox(); updateSymbols(); return; }
  if (t.dataset.undo) { const keep = S.selBp; setSequence(S.refSeq, { keepCam: true, keepSel: true }); S.selBp = keep; dview.setDim(keep !== null ? new Set([keep]) : null); renderStrip(); renderPairBox(); return; }
  const m = t.dataset.mut;
  if (!m) return;
  const i = S.selBp;
  if (S.refSeq.length !== S.seq.length) S.refSeq = S.seq;
  const ns = S.seq.slice(0, i) + m + S.seq.slice(i + 1);
  setSequence(ns, { mutation: true, keepCam: true, keepSel: true });
  S.selBp = i; dview.setDim(new Set([i])); renderStrip(); renderPairBox();
});

// ======================= forme =======================
const FORM_TEXT = {
  B: { t: "Forma B — quella delle cellule", p: ["La forma più comune, in acqua. <b>Destrorsa</b>, circa 10 coppie per giro, coppie quasi perpendicolari all'asse. È quella descritta da Watson e Crick nel 1953, con l'aiuto dei dati ai raggi X di Rosalind Franklin e Raymond Gosling (la «foto 51»).", "Il <b>solco maggiore</b> è largo: è lì che molte proteine «leggono» la sequenza senza aprire l'elica.", "In soluzione il giro è di circa 10,5 coppie; nei cristalli e nelle fibre circa 10."] },
  A: { t: "Forma A — più tozza", p: ["<b>Destrorsa</b> ma più corta e larga: circa 11 coppie per giro, coppie <b>inclinate</b> e spostate dall'asse (guardala dall'alto: al centro resta un buco).", "Si forma quando il DNA è <b>disidratato</b> ed è la forma delle doppie eliche di <b>RNA</b> e degli ibridi DNA-RNA, come durante la trascrizione.", "Il solco maggiore diventa stretto e profondo, il minore largo e basso."] },
  Z: { t: "Forma Z — sinistrorsa", p: ["<b>Sinistrorsa</b>, con lo scheletro a <b>zig-zag</b> (da cui la Z) e circa 12 coppie per giro: l'unità che si ripete è una coppia di coppie (CG + GC).", "Si forma con sequenze che <b>alternano C e G</b>, con molto sale o quando il DNA è superavvolto negativamente. Le guanine sono ruotate sullo zucchero (conformazione <i>syn</i>).", "Scoperta nel 1979 da Andrew Wang e Alexander Rich proprio con un cristallo di CGCGCG. Il solco maggiore è quasi piatto."] },
};
const FORM_REF = (() => {
  const out = {};
  for (const k of ["A", "B", "Z"]) {
    const seq = k === "Z" ? "CGCGCGCGCGCGCGCGCGCGCGCG" : "CGCGAATTCGCGCGCGAATTCGCG";
    const p = Mo.formParams(k);
    const top = Mo.buildTopology(Mo.duplexStrands(seq), seq.length);
    const fr = Mo.bpFrames(p, seq.length);
    const pos = new Float32Array(top.atoms.length * 3);
    Mo.computePositions(top, p, fr, pos);
    out[k] = Mo.measureModel(top, pos, fr, p);
  }
  return out;
})();
function renderFormPanel() {
  const rows = [
    ["Verso dell'elica", (m) => m.handed],
    ["Coppie per giro", (m) => fmt(m.bpPerTurn, 1)],
    ["Salita per coppia", (m) => fmt(m.stepRise, 2) + " Å"],
    ["Rotazione per coppia", (m) => fmt(m.stepTwist, 1) + "°"],
    ["Passo (un giro)", (m) => fmt(m.pitch / 10, 2) + " nm"],
    ["Diametro tra i fosfati", (m) => fmt(m.diamP / 10, 2) + " nm"],
    ["Inclinazione coppie", (m) => fmt(m.incl, 0) + "°"],
    ["Solco minore", (m, k) => (k === "Z" ? "stretto, profondo" : fmt(m.minor, 1) + " Å")],
    ["Solco maggiore", (m, k) => (k === "Z" ? "quasi piatto" : fmt(m.major, 1) + " Å")],
  ];
  const cols = ["A", "B", "Z"];
  $("#formTable").innerHTML = `<tr><th></th>${cols.map((k) => `<th>${k}</th>`).join("")}</tr>` +
    rows.map(([name, f]) => `<tr><td>${name}</td>${cols.map((k) => `<td class="${k === S.form ? "cur" : ""}">${f(FORM_REF[k], k)}</td>`).join("")}</tr>`).join("") +
    `<tr><td>Cristallo di origine</td>${cols.map((k) => `<td class="${k === S.form ? "cur" : ""}">${Mo.FORM_DATA[k].pdb}</td>`).join("")}</tr>`;
  const ft = FORM_TEXT[S.form];
  $("#formText").innerHTML = `<h3>${ft.t}</h3>${ft.p.map((x) => `<p>${x}</p>`).join("")}<p style="font-size:12px">I valori della tabella sono misurati sul modello costruito dai cristalli (${Mo.FORM_DATA.A.pdb}, ${Mo.FORM_DATA.B.pdb}, ${Mo.FORM_DATA.Z.pdb}) e possono scostarsi dai valori «da libro», che vengono dalle fibre: per la forma A i libri danno un solco maggiore di circa 3 Å e un minore di circa 11 Å. Coordinate da: ${Mo.FORM_SOURCES[S.form]}.</p>`;
}
function syncFormButtons() { $$("#segForm button").forEach((b) => { b.classList.toggle("on", b.dataset.form === S.form); b.setAttribute("aria-pressed", b.dataset.form === S.form ? "true" : "false"); }); renderFormPanel(); }
function morphTo(k) {
  if (k === S.form && !S.morph) return;
  if (k === "Z" && !isZok(S.seq)) {
    const n = Math.max(6, S.seq.length - (S.seq.length % 2));
    const z = $("#zNotice");
    z.innerHTML = `La forma Z si forma con sequenze che alternano <b>C e G</b> (CGCGCG…). La sequenza di adesso non va bene.<br><button class="btn accent small" id="zYes">Carica CGCG… di ${n} coppie e trasforma</button><button class="btn ghost small" id="zNo">Lascia stare</button>`;
    z.hidden = false;
    $("#zYes").onclick = () => { z.hidden = true; sel.value = "zdna"; $("#presetNote").textContent = PRESETS.find((p) => p.id === "zdna").nota; setSequence("CG".repeat(n / 2)); morphTo("Z"); };
    $("#zNo").onclick = () => (z.hidden = true);
    return;
  }
  $("#zNotice").hidden = true;
  S.morph = { from: S.params, to: Mo.formParams(k), t: 0, dur: 2.4 };
  S.form = k;
  syncFormButtons();
}
$("#segForm").addEventListener("click", (e) => { const k = e.target.dataset.form; if (k) morphTo(k); });

// ======================= replicazione =======================
const enzMat = {
  elicasi: "#ff7b3a", "DNA polimerasi": "#8fb4d8", primasi: "#f08ac0", ligasi: "#4cc38a", topoisomerasi: "#c9a46a",
};
const enzPool = {};
function enzObj(id, kind) {
  if (!enzPool[id]) {
    const geo = kind === "ring" ? new THREE.TorusGeometry(1, 0.3, 14, 40) : new THREE.SphereGeometry(1, 28, 20);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: enzMat[id], transparent: true, opacity: 0.38, roughness: 0.3, depthWrite: false }));
    const l = label(id, "enz");
    l.element.style.borderColor = enzMat[id];
    repGroup.add(m, l);
    enzPool[id] = { m, l };
  }
  return enzPool[id];
}
function ensureReplication() {
  const seq = S.seq.slice(0, 24);
  if (S.rep && S.repSeq === seq) return;
  S.rep = new Replication(seq);
  S.repSeq = seq;
  rview.setTopology(S.rep.top, S.rep.hbonds);
  rview.colorMode = "age";
  rview.rep = dview.rep;
  rview.recolor();
  S.repT = 0;
  $("#repPhases").innerHTML = S.rep.phases.map((p, i) => `<li data-ph="${i}">${p.title}</li>`).join("");
  evalReplication();
}
function evalReplication() {
  const r = S.rep;
  const out = r.evaluate(S.repT, rview);
  if (out.rnaChanged) rview.recolor();
  rview.update(out.pos);
  for (const k of Object.keys(enzPool)) { enzPool[k].m.visible = false; enzPool[k].l.visible = false; }
  const seen = {};
  for (const e of out.enzymes) {
    const key = seen[e.id] ? e.id + " " + seen[e.id] : e.id;
    seen[e.id] = (seen[e.id] || 1) + 1;
    const o = enzObj(key, e.kind);
    if (!enzMat[key]) o.m.material.color.set(enzMat[e.id]);
    o.l.element.textContent = e.id;
    o.m.position.set(...e.pos); o.m.scale.setScalar(e.r); o.m.visible = true;
    o.l.position.set(e.pos[0], e.pos[1], e.pos[2] + e.r + 2); o.l.visible = true;
  }
  const ph = out.phase;
  const idx = r.phases.indexOf(ph);
  $$("#repPhases li").forEach((li, i) => li.classList.toggle("on", i === idx));
  if (!S.tour) showCaption(ph.title, ph.text, null);
  $("#rngRep").value = Math.round((S.repT / r.duration) * 1000);
}
function setRepPlaying(p) {
  S.repPlaying = p;
  $("#btnRepPlay").innerHTML = p ? `${icon("pause")}<span>Pausa</span>` : S.repT >= S.rep.duration ? `${icon("restart")}<span>Ricomincia</span>` : `${icon("play")}<span>Avvia</span>`;
}
$("#btnRepPlay").onclick = () => {
  ensureReplication();
  if (S.repT >= S.rep.duration) S.repT = 0;
  setRepPlaying(!S.repPlaying);
};
$("#rngRep").oninput = (e) => { ensureReplication(); S.repT = (e.target.value / 1000) * S.rep.duration; setRepPlaying(false); evalReplication(); };
$("#selRepSpeed").onchange = (e) => (S.repSpeed = +e.target.value);
function jumpPhase(d) {
  ensureReplication();
  const ph = S.rep.phases;
  let k = ph.indexOf(S.rep.phaseAt(S.repT)) + d;
  k = Math.max(0, Math.min(ph.length - 1, k));
  S.repT = ph[k].t + 0.01;
  evalReplication();
}
$("#btnRepPrev").onclick = () => jumpPhase(-1);
$("#btnRepNext").onclick = () => jumpPhase(1);
$("#repPhases").addEventListener("click", (e) => { const i = e.target.dataset.ph; if (i !== undefined) { ensureReplication(); S.repT = S.rep.phases[+i].t + 0.01; evalReplication(); } });

// ======================= scala =======================
$("#levels").innerHTML = LEVELS.map((L, i) => `<li data-lv="${i}">${L.nome}<span>${L.breve}</span></li>` + (L.id === "f30" ? `<li class="limit" aria-hidden="true">limite del microscopio ottico · circa 200 nm</li>` : "")).join("");
$("#levels").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-lv]"); if (!li) return;
  S.scalePlay = null;
  S.scaleTarget = Math.log10(LEVELS[+li.dataset.lv].frame);
});
$("#rngScale").oninput = (e) => { S.scalePlay = null; S.scaleTarget = null; scaleScene.setLog(scaleScene.minLog + (e.target.value / 1000) * (scaleScene.maxLog - scaleScene.minLog)); };
canvas.addEventListener("wheel", (e) => {
  if (S.mode !== "scala") return;
  e.preventDefault();
  S.scalePlay = null; S.scaleTarget = null;
  scaleScene.setLog(scaleScene.logW + Math.sign(e.deltaY) * 0.06);
}, { passive: false });
$("#btnScalePlay").onclick = () => {
  S.scalePlay = { t: 0 };
  scaleScene.setLog(scaleScene.minLog);
};
function niceLen(maxUnits) {
  const steps = [1, 2, 5];
  let best = 1;
  for (let e = -3; e < 9; e++) for (const s of steps) { const v = s * 10 ** e; if (v <= maxUnits) best = v; }
  return best;
}
function fmtLenNm(nm) {
  if (nm >= 1e6) return fmt(nm / 1e6, nm % 1e6 ? 1 : 0) + " mm";
  if (nm >= 1000) return fmt(nm / 1000, nm % 1000 ? 1 : 0) + " µm";
  if (nm >= 1) return fmt(nm, nm % 1 ? 1 : 0) + " nm";
  return fmt(nm * 10, 0) + " Å";
}
function updateScaleUI(dt) {
  if (S.scalePlay) {
    S.scalePlay.t += dt;
    const per = 3.2, k = Math.floor(S.scalePlay.t / per), u = (S.scalePlay.t % per) / per;
    if (k >= LEVELS.length - 1) { S.scalePlay = null; }
    else {
      const a = Math.log10(LEVELS[k].frame), b = Math.log10(LEVELS[k + 1].frame);
      const w = u < 0.45 ? 0 : ease((u - 0.45) / 0.55);
      scaleScene.setLog(a + (b - a) * w);
    }
  } else if (S.scaleTarget !== null && S.scaleTarget !== undefined) {
    const d = S.scaleTarget - scaleScene.logW;
    scaleScene.setLog(scaleScene.logW + d * Math.min(1, dt * 4));
    if (Math.abs(d) < 0.002) S.scaleTarget = null;
  }
  const cur = scaleScene.current(), L = LEVELS[cur];
  $$("#levels li[data-lv]").forEach((li) => li.classList.toggle("on", +li.dataset.lv === cur));
  const box = $("#scaleinfo");
  box.hidden = false;
  box.querySelector("h3").textContent = L.nome;
  box.querySelector(".size").textContent = L.misura;
  box.querySelector(".fact").innerHTML = L.fatto;
  const vw = scaleScene.viewWidthNm();
  box.querySelector(".width").textContent = `Larghezza della vista: ${fmtLenNm(vw)}` + (vw < 200 ? " · più piccolo di quanto un microscopio ottico possa mostrare (circa 200 nm): si vede solo con il microscopio elettronico o con i raggi X" : "");
  $("#rngScale").value = Math.round(((scaleScene.logW - scaleScene.minLog) / (scaleScene.maxLog - scaleScene.minLog)) * 1000);
  // barra di scala: nm per pixel
  const rect = canvas.getBoundingClientRect();
  const pxPerNm = Math.min(rect.width, rect.height) / vw;
  const len = niceLen(150 / pxPerNm);
  setScaleBar(len * pxPerNm, fmtLenNm(len));
}
function setScaleBar(px, text) {
  const sb = $("#scalebar");
  sb.querySelector(".bar").style.width = px + "px";
  sb.querySelector("span").textContent = text;
}
function updateMolScaleBar() {
  const rect = canvas.getBoundingClientRect();
  let d;
  if (S.flying) { const p = camera.position.clone(); spin.worldToLocal(p); d = Math.max(5, Math.hypot(p.x, p.z)); }
  else d = camera.position.distanceTo(controls.target);
  const worldH = 2 * d * Math.tan((camera.fov * Math.PI) / 360);
  const pxPerA = rect.height / worldH;
  const lenA = niceLen(150 / pxPerA);
  setScaleBar(lenA * pxPerA, lenA >= 10 ? `${fmt(lenA / 10, lenA % 10 ? 1 : 0)} nm` : `${fmt(lenA, 0)} Å = ${fmt(lenA / 10, 1)} nm`);
}

// ======================= modalità =======================
function setMode(m) {
  stopFly();
  S.mode = m;
  $$(".tab").forEach((t) => { t.classList.toggle("active", t.dataset.mode === m); t.setAttribute("aria-selected", t.dataset.mode === m ? "true" : "false"); });
  $$(".mode-panel").forEach((p) => (p.hidden = p.dataset.for !== m));
  const inMol = m === "esplora" || m === "forme";
  mol.visible = inMol;
  repGroup.visible = m === "replica";
  $("#strip").hidden = !inMol;
  $("#labels").style.display = m === "scala" ? "none" : "";
  $("#scaleinfo").hidden = m !== "scala";
  controls.enabled = m !== "scala";
  scaleScene.controls.enabled = m === "scala";
  if (!S.tour) $("#caption").hidden = m !== "replica";
  if (m !== "esplora" && S.ruler) setRuler(false);
  if (m !== "esplora" && S.selBp !== null) { S.selBp = null; dview.setDim(null); renderStrip(); }
  for (const it of measures.items) for (const o of [it.line, it.d1, it.d2, it.lb, it.guide]) o.visible = m !== "replica";
  for (const k of Object.keys(enzPool)) { enzPool[k].l.visible = false; }
  updateLabels();
  updateGrooves();
  updateSymbols();
  renderPairBox();
  if (m === "forme") renderFormPanel();
  if (m === "replica") {
    ensureReplication();
    setSpin(0);
    spin.rotation.y = 0;
    S.tween = { t: 0, dur: 1, fromT: controls.target.clone(), toT: new THREE.Vector3(0, 0, 0), fromP: camera.position.clone(), toP: new THREE.Vector3(0, 10, Math.max(170, S.rep.N * 3.4 * 2.1) * (camera.aspect < 1 ? 1.7 : 1)) };
    evalReplication();
  } else {
    S.repPlaying = false;
    for (const k of Object.keys(enzPool)) { enzPool[k].m.visible = false; }
  }
  if (inMol && S.top) frameAll();
  $("#panel").classList.remove("open");
}
$$(".tab").forEach((t) => (t.onclick = () => { endTour(); setMode(t.dataset.mode); }));

// ======================= didascalia (giro guidato e replicazione) =======================
function showCaption(title, text, nav) {
  const c = $("#caption");
  c.querySelector("h3").innerHTML = title;
  c.querySelector("p").innerHTML = text;
  const n = c.querySelector(".cap-nav");
  n.innerHTML = nav || "";
  n.hidden = !nav;
  c.hidden = false;
  arrangeOverlays();
}

// ======================= giro guidato =======================
function middleBpOf(letters) {
  const n = S.seq.length, c = Math.floor(n / 2);
  for (let d = 0; d < n; d++) for (const k of [c + d, c - d]) if (k >= 0 && k < n && letters.includes(S.seq[k])) return k;
  return c;
}
const TOUR = [
  { title: "Una doppia elica vera", text: "Questa elica non è un disegno: è costruita a partire dalle coordinate misurate nei <b>cristalli ai raggi X</b> (struttura 1BNA, 1981), atomo per atomo. Trascina per girarla, usa la rotella per avvicinarti.", run() { setMode("esplora"); if (S.form !== "B") morphTo("B"); setRep("cartoon"); setColor("base"); setLayer("#chkLabels", true); setLayer("#chkBases", true); setLayer("#chkBackbone", true); measures.clear(); S.selBp = null; dview.setDim(null); frameAll(); setSpin(22); } },
  { title: "Due filamenti antiparalleli", text: "I due filamenti corrono in <b>direzioni opposte</b>: il filamento I va da 5′ a 3′ verso l'alto, il II verso il basso. 5′ e 3′ sono i nomi di due atomi di carbonio dello zucchero.", run() { setColor("strand"); setLayer("#chkLabels", true); frameAll(); } },
  { title: "Le coppie di basi", text: "<b>A con T</b> (2 legami a idrogeno) e <b>G con C</b> (3). Sempre una purina (due anelli) con una pirimidina (un anello): così tutti i «pioli» hanno la stessa larghezza, circa 10,7 Å tra i due C1′.", run() { setColor("base"); setRep("cartoon"); measures.clear(); addPreset("hbgc"); } },
  { title: "Atomo per atomo", text: "Ogni pallina è un atomo: <b>carbonio</b> grigio, <b>azoto</b> blu, <b>ossigeno</b> rosso, <b>fosforo</b> arancione. Gli idrogeni non ci sono: i raggi X quasi non li vedono. Passa il mouse su un atomo per sapere cos'è.", run() { setRep("bs"); setColor("element"); S.showFormula = false; renderPairBox(); } },
  { title: "Fino alla formula chimica", text: "Andiamo ancora più a fondo: sotto c'è la <b>formula di struttura</b> della coppia che hai davanti, disegnata con le stesse coordinate dell'elica. Ogni vertice senza lettera è un carbonio; i tratteggi sono i legami a idrogeno. Nel pannello «Sequenza» trovi anche la <b>formula bruta</b> di tutta la molecola.", run() { setRep("bs"); setColor("element"); S.showFormula = true; const bp = S.selBp ?? middleBpOf(["G", "C"]); selectBp(bp, true); renderPairBox(); } },
  { title: "Lo scheletro zucchero-fosfato", text: "All'esterno corrono lo zucchero (<b>desossiribosio</b>) e il <b>fosfato</b>. Ogni fosfato ha una carica negativa: il DNA è un <b>acido</b> e attira ioni positivi come Na⁺ e Mg²⁺.", run() { measures.clear(); S.selBp = null; dview.setDim(null); renderStrip(); renderPairBox(); setRep("bs"); setColor("base"); setLayer("#chkBases", false); frameAll(); setSpin(15); } },
  { title: "Solco maggiore e solco minore", text: "Le due catene non sono equidistanti: lasciano un solco <b>largo</b> e uno <b>stretto</b>. Nel solco maggiore le proteine riconoscono la sequenza senza aprire l'elica.", run() { setLayer("#chkBases", true); setRep("spacefill"); setColor("base"); measures.clear(); addPreset("minor"); addPreset("major"); setSpin(0); } },
  { title: "Le misure", text: "Circa 0,34 nm tra una coppia e l'altra, circa 10 coppie per giro, circa 2 nm di diametro: sono i numeri del modello di Watson e Crick (1953), costruito anche grazie ai dati ai raggi X di <b>Rosalind Franklin</b> e Raymond Gosling, come la «foto 51». Qui li misuri tu, con il righello.", run() { setRep("cartoon"); measures.clear(); addPreset("rise"); addPreset("pitch"); addPreset("diam"); frameAll(); } },
  { title: "Tre forme: A, B e Z", text: "La stessa molecola può avvolgersi in modi diversi. Ecco la forma <b>A</b>: più tozza, con le coppie inclinate. Nel pannello trovi le misure delle tre forme a confronto.", run() { measures.clear(); setMode("forme"); setSpin(18); morphTo("A"); } },
  { title: "Dal DNA alle proteine", text: "Tre lettere fanno un <b>codone</b>, e ogni codone vale un amminoacido (la riga in basso). Nel gene dell'emoglobina basta cambiare una A in T, nel codone GAG che diventa GTG, perché l'acido glutammico diventi valina: è l'<b>anemia falciforme</b>.", run() { setMode("esplora"); morphTo("B"); sel.value = "falciforme"; sel.onchange(); } },
  { title: "Ora tocca a te", text: "Prova la <b>replicazione</b> e il confronto di <b>scala</b> dalle linguette in alto, oppure scrivi la tua sequenza e cambia le basi una alla volta.", run() { setSpin(22); frameAll(); } },
];
function tourStep(k) {
  $("#intro").hidden = true;
  S.tour = { k };
  const st = TOUR[k];
  grooveState.pin.clear();
  st.run();
  updateGrooves();
  const nav = `<span class="count">${k + 1} / ${TOUR.length}</span>` +
    (k > 0 ? `<button class="btn ghost small" data-t="-1">Indietro</button>` : "") +
    (k < TOUR.length - 1 ? `<button class="btn accent small" data-t="1">Avanti</button>` : `<button class="btn accent small" data-t="end">Fine</button>`) +
    `<button class="btn ghost small" data-t="end">Esci</button>`;
  showCaption(st.title, st.text + `<div class="progress"><i style="transform:scaleX(${(k + 1) / TOUR.length})"></i></div>`, nav);
}
function endTour() {
  if (!S.tour) return;
  S.tour = null;
  $("#caption").hidden = S.mode !== "replica";
  arrangeOverlays();
  $("#btnTour").innerHTML = `${icon("play")}<span>Giro guidato</span>`;
}
$("#caption").addEventListener("click", (e) => {
  const t = e.target.closest("[data-t]")?.dataset.t;
  if (!t || !S.tour) return;
  if (t === "end") return endTour();
  tourStep(Math.max(0, Math.min(TOUR.length - 1, S.tour.k + +t)));
});
$("#btnTour").onclick = () => { if (S.tour) endTour(); else { $("#btnTour").innerHTML = `${icon("stop")}<span>Esci dal giro</span>`; tourStep(0); } };

// ======================= barra in alto =======================
// finestra d'aiuto: il fuoco entra nella finestra e torna al pulsante quando si chiude
function openHelp() { $("#help").hidden = false; $("#btnHelpClose").focus(); }
function closeHelp() { if ($("#help").hidden) return; $("#help").hidden = true; $("#btnHelp").focus(); }
$("#btnHelp").onclick = openHelp;
$("#btnHelpClose").onclick = closeHelp;
$("#help").addEventListener("click", (e) => { if (e.target.id === "help") closeHelp(); });
// testo e pulsanti grandi, per la LIM e il proiettore (la scelta resta; sulle LIM parte già acceso, vedi index.html)
function syncBig() {
  const on = document.documentElement.dataset.size === "big";
  $("#btnBig").setAttribute("aria-pressed", on ? "true" : "false");
  $("#btnBig").classList.toggle("on", on);
}
$("#btnBig").onclick = () => {
  const on = document.documentElement.dataset.size !== "big";
  document.documentElement.dataset.size = on ? "big" : "normal";
  try { localStorage.setItem("ulisse-size", on ? "big" : "normal"); } catch (e) { /* niente */ }
  syncBig();
  toast(on ? "Testo e pulsanti grandi: comodi sulla LIM." : "Testo e pulsanti di misura normale.");
};
syncBig();
$("#sourcesText").innerHTML = Object.values(Mo.FORM_SOURCES).join(".<br>") + ".<br>Le coordinate dello scheletro sono la media dei nucleotidi di ogni cristallo, rifinita perché i legami tra un nucleotide e l'altro tornino alla lunghezza vera (1,60 Å) su un'elica regolare. Le basi sono quelle standard: le distanze dei legami a idrogeno (2,9–3,0 Å) escono da sole.";
$("#btnFull").onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };
$("#btnTheme").onclick = () => {
  const r = document.documentElement;
  r.dataset.theme = r.dataset.theme === "light" ? "dark" : "light";
  try { localStorage.setItem("dna-theme", r.dataset.theme); } catch (e) { /* niente */ }
};
try { const t = localStorage.getItem("dna-theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* niente */ }
$("#btnShot").onclick = () => {
  const c = document.createElement("canvas");
  c.width = canvas.width; c.height = canvas.height;
  const g = c.getContext("2d");
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#070b18";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(canvas, 0, 0);
  const a = document.createElement("a");
  a.download = "ulisse-dna.png"; a.href = c.toDataURL("image/png"); a.click();
};
$("#btnPanel").onclick = () => $("#panel").classList.toggle("open");

// ======================= volo (il mouse resta libero) =======================
const keys = {};
const look = { yaw: 0, pitch: 0, drag: null };
const flyMove = { f: 0, r: 0, u: 0 }; // pulsanti a schermo tenuti premuti
camera.rotation.order = "YXZ";
function startFly() {
  if (S.mode === "scala" || S.flying) return;
  S.spinBeforeFly = +$("#rngSpin").value;
  setSpin(0);
  S.tween = null;
  S.flying = true;
  controls.enabled = false;
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  look.yaw = Math.atan2(-dir.x, -dir.z);
  look.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  $("#flyhud").hidden = false; $("#tooltip").hidden = true;
  canvas.classList.add("flying");
  updateLabels(); updateGrooves();
  $("#btnFly").lastChild.textContent = "Esci dal volo";
  $("#panel").classList.remove("open");
}
function stopFly() {
  if (!S.flying) return;
  S.flying = false;
  look.drag = null;
  for (const k of Object.keys(keys)) keys[k] = false;
  flyMove.f = flyMove.r = flyMove.u = 0;
  $("#flyhud").hidden = true;
  canvas.classList.remove("flying");
  if (S.top) { updateLabels(); updateGrooves(); }
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  controls.target.copy(camera.position).addScaledVector(dir, 30);
  controls.enabled = S.mode !== "scala";
  $("#btnFly").lastChild.textContent = "Vola dentro l'elica";
}
$("#btnFly").onclick = () => (S.flying ? stopFly() : startFly());
$("#btnFlyExit").onclick = stopFly;
canvas.addEventListener("pointerdown", (e) => {
  if (!S.flying) return;
  look.drag = [e.clientX, e.clientY];
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!S.flying || !look.drag) return;
  look.yaw -= (e.clientX - look.drag[0]) * 0.004;
  look.pitch = Math.max(-1.45, Math.min(1.45, look.pitch - (e.clientY - look.drag[1]) * 0.004));
  look.drag = [e.clientX, e.clientY];
});
const endDrag = () => (look.drag = null);
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("wheel", (e) => {
  if (!S.flying) return;
  e.preventDefault();
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  camera.position.addScaledVector(dir, -Math.sign(e.deltaY) * 4);
}, { passive: false });
$$("#flyhud [data-move]").forEach((b) => {
  const [axis, sign] = [b.dataset.move[0], b.dataset.move[1] === "+" ? 1 : -1];
  const on = (e) => { e.preventDefault(); flyMove[axis] = sign; b.setPointerCapture?.(e.pointerId); };
  const off = () => (flyMove[axis] = 0);
  b.addEventListener("pointerdown", on);
  b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
});
const FLY_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight"];
addEventListener("keydown", (e) => {
  if (e.code === "Escape") { closeHelp(); stopFly(); }
  if (!S.flying || (e.target instanceof Element && e.target.closest("textarea, input, select"))) return;
  if (FLY_KEYS.includes(e.code)) { keys[e.code] = true; e.preventDefault(); }
});
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k of Object.keys(keys)) keys[k] = false; });
function flyStep(dt) {
  camera.rotation.set(look.pitch, look.yaw, 0);
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  const right = new THREE.Vector3(Math.cos(look.yaw), 0, -Math.sin(look.yaw));
  const v = (keys.ShiftLeft || keys.ShiftRight ? 45 : 14) * dt;
  const f = ((keys.KeyW || keys.ArrowUp) ? 1 : 0) - ((keys.KeyS || keys.ArrowDown) ? 1 : 0) + flyMove.f;
  const r = ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) + flyMove.r;
  const u = ((keys.KeyE || keys.Space) ? 1 : 0) - (keys.KeyQ ? 1 : 0) + flyMove.u;
  camera.position.addScaledVector(fwd, f * v).addScaledVector(right, r * v);
  camera.position.y += u * v;
}

// ======================= ridimensionamento =======================
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  scaleScene.camera.aspect = w / h; scaleScene.camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

// ======================= ciclo =======================
let last = performance.now();
const perf = { from: 0, t: 0, n: 0, stage: 0 };
function watchSpeed(now, raw) {
  if (perf.stage >= 2 || document.hidden) return;
  if (!perf.from) perf.from = now + 2500; // i primi secondi preparano gli shader: non contano
  if (now < perf.from || raw > 1000) return; // pause lunghe (scheda nascosta) non contano
  perf.t += raw; perf.n++;
  if (perf.t < 2500) return;
  const avg = perf.t / perf.n;
  perf.t = perf.n = 0;
  if (avg < 45) return; // più di ~22 fotogrammi al secondo: va bene così
  if (perf.stage === 0) { keyLight.castShadow = false; perf.stage = 1; }
  else if (renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); resize(); perf.stage = 2; }
  else perf.stage = 2;
}
function loop(now) {
  const raw = now - last;
  const dt = Math.min(0.1, raw / 1000);
  last = now;
  watchSpeed(now, raw);
  if (S.mode === "scala") {
    scaleScene.render(dt);
    updateScaleUI(dt);
    requestAnimationFrame(loop);
    return;
  }
  spin.rotation.y += S.spinSpeed * dt;
  if (S.morph) {
    const m = S.morph;
    m.t = Math.min(1, m.t + dt / m.dur);
    S.params = m.t >= 1 ? m.to : Mo.lerpParams(m.from, m.to, ease(m.t));
    updateGeometry();
    if (m.t >= 1) { S.morph = null; renderStats(); }
  }
  if (S.mode === "replica" && S.rep && S.repPlaying) {
    S.repT = Math.min(S.rep.duration, S.repT + dt * S.repSpeed);
    evalReplication();
    if (S.repT >= S.rep.duration) setRepPlaying(false);
  }
  if (S.flying) {
    flyStep(dt);
  } else {
    if (S.tween) {
      const tw = S.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const u = ease(tw.t);
      controls.target.lerpVectors(tw.fromT, tw.toT, u);
      camera.position.lerpVectors(tw.fromP, tw.toP, u);
      if (tw.t >= 1) S.tween = null;
    }
    controls.update();
  }
  // se la scheda della coppia copre la destra, sposta il centro della vista a sinistra
  const box = $("#pairbox");
  const wantOff = !box.hidden && stage.clientWidth > 860 ? (box.offsetWidth + 14) / 2 : 0;
  S.viewOff = (S.viewOff || 0) + (wantOff - (S.viewOff || 0)) * Math.min(1, dt * 6);
  if (Math.abs(S.viewOff) > 0.5) camera.setViewOffset(stage.clientWidth, stage.clientHeight, S.viewOff, 0, stage.clientWidth, stage.clientHeight);
  else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  if (needPick || (lastPointer && S.spinSpeed > 0)) doPick();
  updateKeyLight();
  if (grooveFx.major.visible || grooveFx.minor.visible) grooveCZ.value = new THREE.Vector3().applyMatrix4(camera.matrixWorldInverse).z;
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  updateMolScaleBar();
  requestAnimationFrame(loop);
}

// ======================= avvio =======================
loader("Costruisco la doppia elica, atomo per atomo", 0.5);
$("#txtSeq").value = S.seq;
setSpin(matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 22);
buildDuplex();
renderFormPanel();
resize();
frameAll();
camera.position.copy(S.tween.toP); controls.target.copy(S.tween.toT); S.tween = null;
loader("Preparo luci e ombre", 0.7);
{
  // le LIM sono lente: gli shader si preparano senza bloccare la pagina, poi parte il disegno
  const go = () => requestAnimationFrame((t) => { last = t; loop(t); loader("Ultimi ritocchi", 0.95); window.__loader?.done(); });
  updateKeyLight();
  if (renderer.compileAsync) renderer.compileAsync(scene, camera).then(go, go); else go();
}
// primi passi: compare finché non lo chiudi
(() => {
  let seen = false;
  try { seen = localStorage.getItem("ulisse-intro") === "1"; } catch (e) { /* niente */ }
  const box = $("#intro");
  if (seen) return;
  box.hidden = false;
  $("#introClose").onclick = () => { box.hidden = true; try { localStorage.setItem("ulisse-intro", "1"); } catch (e) { /* niente */ } };
  $("#introTour").onclick = () => { $("#introClose").onclick(); $("#btnTour").click(); };
})();
window.__dna = { S, measures, dview, rview, setMode, morphTo, addPreset, selectBp, setRep, scaleScene, renderer, scene, camera, labelRenderer, controls, setLength, toggleGroove }; // per i test
