// Replicazione semiconservativa animata (schema didattico su coordinate vere di forma B).
import * as M from "./math.js";
import { buildTopology, bpFrames, computePositions, hbondsBetween, formParams } from "./model.js";
import { COMPLEMENT } from "./data.js";

const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));

export class Replication {
  constructor(seq) {
    const N = seq.length;
    this.N = N;
    const s1 = seq.split(""), s2 = s1.map((b) => COMPLEMENT[b]);
    this.strands = [
      { id: "I", seq: s1, flip: false, dir: 1, kind: "old" },
      { id: "II", seq: s2, flip: true, dir: -1, kind: "old" },
      { id: "nuovo su I (guida)", seq: s2.slice(), flip: true, dir: -1, kind: "new", keep5P: true },
      { id: "nuovo su II (ritardato)", seq: s1.slice(), flip: false, dir: 1, kind: "new", keep5P: true },
    ];
    this.top = buildTopology(this.strands, N);
    this.p = formParams("B");
    this.frames = bpFrames(this.p, N);
    this.hbOld = hbondsBetween(this.top, 0, 1).map((h) => [...h, "old"]);
    this.hbLead = hbondsBetween(this.top, 0, 2).map((h) => [...h, "lead"]);
    this.hbLag = hbondsBetween(this.top, 3, 1).map((h) => [...h, "lag"]);
    this.hbonds = [...this.hbOld, ...this.hbLead, ...this.hbLag];
    this.pos = new Float32Array(this.top.atoms.length * 3);
    this.schedule();
  }

  schedule() {
    const N = this.N;
    const T0 = 3, v = 2.2; // coppie al secondo (rallentato per vederlo)
    this.T0 = T0; this.v = v;
    const tf = (i) => T0 + (N + 0.5 - i) / v; // istante in cui la forcella supera la coppia i
    this.tf = tf;
    this.app = new Map(); // `${strand}|${bp}` -> {t, rna, frag}
    // filamento guida (strand 2): innesco in cima, poi continuo seguendo la forcella
    const PL = Math.min(4, N);
    const tPrimeLead = tf(N - 1 - PL - 1);
    for (let k = 0; k < PL; k++) this.app.set(`2|${N - 1 - k}`, { t: tPrimeLead + 0.25 * k, rna: true, frag: 0 });
    for (let i = N - 1 - PL; i >= 0; i--) this.app.set(`2|${i}`, { t: Math.max(tf(i - 3), tPrimeLead + 0.25 * PL + 0.3), rna: false, frag: 0 });
    // filamento ritardato (strand 3): frammenti di Okazaki (accorciati: 7 nt)
    const Lf = 7, vpol = 5;
    this.fragments = [];
    let hi = N - 1, k = 0;
    while (hi >= 0) {
      const lo = Math.max(0, hi - Lf + 1);
      const t0 = tf(lo - 1.5);
      const primerLen = Math.min(3, hi - lo + 1);
      for (let j = 0; j < primerLen; j++) this.app.set(`3|${lo + j}`, { t: t0 + 0.22 * j, rna: true, frag: k });
      for (let j = lo + primerLen; j <= hi; j++) this.app.set(`3|${j}`, { t: t0 + 0.22 * primerLen + 0.35 + (j - lo - primerLen) / vpol, rna: false, frag: k });
      this.fragments.push({ k, lo, hi, t0, tEnd: t0 + 0.22 * primerLen + 0.35 + (hi - lo - primerLen) / vpol + 0.6 });
      hi = lo - 1; k++;
    }
    let tSynth = 0;
    for (const a of this.app.values()) tSynth = Math.max(tSynth, a.t + 0.7);
    tSynth = Math.max(tSynth, tf(-2));
    this.tLig = tSynth + 0.6;
    // ordine di ligasi: innesco guida + ogni frammento
    this.ligJobs = [{ strand: 2, lo: N - PL, hi: N - 1 }, ...this.fragments.map((f) => ({ strand: 3, lo: f.lo, hi: Math.min(f.hi, f.lo + 2) }))];
    this.ligStep = 0.75;
    this.tFin = this.tLig + this.ligJobs.length * this.ligStep + 0.6;
    this.duration = this.tFin + 4;
    this.tLeadStart = tPrimeLead + 0.25 * PL + 0.3;
    this.tLagStart = this.fragments.length > 1 ? this.fragments[1].t0 : this.fragments[0].t0;
    this.phases = [
      { t: 0, title: "Il punto di partenza", text: "Una doppia elica: due filamenti <b>antiparalleli</b> tenuti insieme dai legami a idrogeno tra le basi (2 tra A e T, 3 tra G e C)." },
      { t: T0, title: "L'elicasi apre la forcella", text: "L'<b>elicasi</b> rompe i legami a idrogeno e separa i due filamenti: si forma la <b>forcella di replicazione</b>. Più avanti la <b>topoisomerasi</b> toglie la tensione (il DNA davanti si attorciglierebbe troppo) e le proteine <b>SSB</b> tengono aperti i filamenti singoli." },
      { t: tPrimeLead, title: "La primasi mette l'innesco", text: "La DNA polimerasi non sa partire da zero: la <b>primasi</b> costruisce un breve <b>innesco di RNA</b> (in rosa, con U al posto di T)." },
      { t: this.tLeadStart, title: "Filamento guida (leading)", text: "La <b>DNA polimerasi</b> legge lo stampo da 3′ a 5′ e costruisce il nuovo filamento <b>da 5′ a 3′</b>, aggiungendo un nucleotide alla volta all'estremità 3′. Qui va nella stessa direzione della forcella: lavora <b>di continuo</b>." },
      { t: this.tLagStart, title: "Filamento ritardato (lagging)", text: "Sull'altro stampo la direzione 5′→3′ è opposta alla forcella: la polimerasi lavora <b>a pezzi</b>, i <b>frammenti di Okazaki</b>, ognuno con il suo innesco. Nella cellula sono lunghi 100–200 nucleotidi negli eucarioti e 1000–2000 nei batteri: qui sono accorciati a 7." },
      { t: this.tLig, title: "Via gli inneschi, la ligasi salda", text: "Gli inneschi di RNA vengono tolti e rimpiazzati con DNA (nei batteri lo fa la DNA polimerasi I); la <b>DNA ligasi</b> salda i frammenti in un filamento unico." },
      { t: this.tFin, title: "Due copie identiche", text: "Ogni nuova doppia elica ha <b>un filamento vecchio</b> (grigio) e <b>uno nuovo</b> (oro): la replicazione è <b>semiconservativa</b>, come dimostrarono Meselson e Stahl nel 1958." },
    ];
  }

  phaseAt(t) { let p = this.phases[0]; for (const ph of this.phases) if (t >= ph.t) p = ph; return p; }

  fork(t) { return t < this.T0 ? this.N + 0.5 : this.N + 0.5 - this.v * (t - this.T0); }

  sep(s, t) {
    if (s <= 0) return 0;
    const y = 11 * (1 - Math.exp(-s / 2.5)) + 0.75 * s;
    const w = smooth(clamp01((t - this.tFin) / 3));
    return y + (15 - y) * w;
  }

  evaluate(t, view) {
    const top = this.top, N = this.N;
    const f = this.fork(t);
    const scale = view.atomScale;
    const flyOff = new Map();
    const rnaNow = new Uint8Array(top.nts.length);
    // visibilità e arrivo dei nuovi nucleotidi
    top.nts.forEach((nt, ntIdx) => {
      let sc = 1;
      if (nt.strand >= 2) {
        const a = this.app.get(`${nt.strand}|${nt.bp}`);
        const u = clamp01((t - a.t) / 0.6);
        sc = u <= 0 ? 0 : smooth(Math.min(1, u * 1.4));
        if (u > 0 && u < 1) flyOff.set(nt, 1 - smooth(u));
        if (a.rna) {
          const job = this.ligJobs.findIndex((j) => j.strand === nt.strand && nt.bp >= j.lo && nt.bp <= j.hi);
          const tRep = this.tLig + job * this.ligStep + 0.35;
          rnaNow[ntIdx] = t < tRep ? 1 : 0;
        }
      }
      for (let i = nt.start; i < nt.end; i++) {
        let s = sc;
        if (top.atoms[i].name === "C7" && rnaNow[ntIdx]) s = 0; // l'uracile non ha il metile
        scale[i] = s;
      }
    });
    let rnaChanged = false;
    for (let k = 0; k < rnaNow.length; k++) if (rnaNow[k] !== view.ntRNA[k]) { rnaChanged = true; view.ntRNA[k] = rnaNow[k]; }
    // posizioni
    const frameFor = (nt) => {
      const F = this.frames[nt.bp];
      const s = nt.bp - f;
      const d = this.sep(s, t);
      const sign = nt.strand === 0 || nt.strand === 2 ? 1 : -1;
      let tt = [F.t[0] + sign * d, F.t[1], F.t[2]];
      const fo = flyOff.get(nt);
      if (fo) {
        const c = [F.t[0], F.t[1]];
        const r = Math.hypot(c[0], c[1]) || 1;
        const out = nt.strand === 2 ? 1 : -1;
        tt = [tt[0] + out * 16 * fo, tt[1] + 10 * fo * (nt.bp % 2 ? 1 : -1), tt[2] + 6 * fo];
      }
      return { R: F.R, t: tt };
    };
    computePositions(top, this.p, this.frames, this.pos, frameFor);
    // legami a idrogeno
    this.hbonds.forEach((h, n) => {
      const bp = h[2];
      if (h[3] === "old") view.hbVisible[n] = bp < f ? 1 : 0;
      else view.hbVisible[n] = 1;
    });
    // enzimi
    const enz = [];
    const C1 = (s, bp) => { const i = top.idx(s, bp, "C1'"); return i === undefined ? null : [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]]; };
    const zAt = (bp) => { const b = Math.max(0, Math.min(N - 1, bp)); return this.frames[Math.round(b)].t[2]; };
    if (t >= this.T0 && f > -1.5) enz.push({ id: "elicasi", pos: [0, 0, zAt(f) + 1.5], r: 8, kind: "ring" });
    if (t >= this.T0 && f - 7 > 0) enz.push({ id: "topoisomerasi", pos: [-9, 6, zAt(f - 7)], r: 4.5, kind: "blob" });
    // polimerasi guida: sull'ultimo nucleotide arrivato del filamento 2
    let lastLead = null;
    for (let i = N - 1; i >= 0; i--) { const a = this.app.get(`2|${i}`); if (a.t <= t) lastLead = i; }
    const leadDone = lastLead === 0 && this.app.get("2|0").t + 0.7 < t;
    if (lastLead !== null && !leadDone && t >= this.tLeadStart - 0.3) {
      const p = C1(2, lastLead); if (p) enz.push({ id: "DNA polimerasi", pos: [p[0] + 5, p[1], p[2] - 2], r: 6.5, kind: "blob" });
    }
    if (lastLead !== null && t < this.tLeadStart) { const p = C1(2, N - 1); if (p) enz.push({ id: "primasi", pos: [p[0] + 5, p[1], p[2]], r: 4, kind: "blob" }); }
    for (const fr of this.fragments) {
      if (t < fr.t0 || t > fr.tEnd) continue;
      let lastJ = null;
      for (let j = fr.lo; j <= fr.hi; j++) if (this.app.get(`3|${j}`).t <= t) lastJ = j;
      if (lastJ === null) continue;
      const priming = this.app.get(`3|${Math.min(fr.hi, fr.lo + 2)}`).t + 0.3 > t;
      const p = C1(3, lastJ);
      if (p) enz.push({ id: priming ? "primasi" : "DNA polimerasi", pos: [p[0] - 5, p[1], p[2] + 2], r: priming ? 4 : 6.5, kind: "blob" });
    }
    if (t >= this.tLig && t < this.tFin) {
      const k = Math.floor((t - this.tLig) / this.ligStep);
      const job = this.ligJobs[Math.min(k, this.ligJobs.length - 1)];
      const p = C1(job.strand, job.strand === 2 ? job.lo : job.hi);
      if (p) enz.push({ id: "ligasi", pos: [p[0] + (job.strand === 2 ? 4 : -4), p[1], p[2]], r: 4, kind: "blob" });
    }
    return { pos: this.pos, enzymes: enz, phase: this.phaseAt(t), rnaChanged, fork: f };
  }
}
