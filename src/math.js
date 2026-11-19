// Piccola libreria di algebra lineare: vettori [x,y,z], matrici 3x3 come righe,
// trasformazioni rigide {R, t} (x' = R x + t), quaternioni [w,x,y,z].

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const I3 = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
export const mT = (A) => [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]];
export function mmul(A, B) {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return C;
}
export const mvec = (A, x) => [
  A[0][0] * x[0] + A[0][1] * x[1] + A[0][2] * x[2],
  A[1][0] * x[0] + A[1][1] * x[1] + A[1][2] * x[2],
  A[2][0] * x[0] + A[2][1] * x[1] + A[2][2] * x[2],
];
export const col = (A, j) => [A[0][j], A[1][j], A[2][j]];
export const fromCols = (a, b, c) => [[a[0], b[0], c[0]], [a[1], b[1], c[1]], [a[2], b[2], c[2]]];

export function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; }
export function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
export function rotAxis(u, a) {
  const [x, y, z] = norm(u), c = Math.cos(a), s = Math.sin(a), C = 1 - c;
  return [
    [c + x * x * C, x * y * C - z * s, x * z * C + y * s],
    [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
    [z * x * C - y * s, z * y * C + x * s, c + z * z * C],
  ];
}

// --- trasformazioni rigide ---
export const T = (R, t) => ({ R, t });
export const apply = (F, x) => add(mvec(F.R, x), F.t);
export const compose = (A, B) => ({ R: mmul(A.R, B.R), t: add(mvec(A.R, B.t), A.t) }); // A(B(x))
export const invert = (F) => { const Rt = mT(F.R); return { R: Rt, t: scale(mvec(Rt, F.t), -1) }; };
export const identity = () => ({ R: I3(), t: [0, 0, 0] });

// --- quaternioni ---
export function quatFromMat(R) {
  const tr = R[0][0] + R[1][1] + R[2][2];
  let w, x, y, z;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2; w = 0.25 * s;
    x = (R[2][1] - R[1][2]) / s; y = (R[0][2] - R[2][0]) / s; z = (R[1][0] - R[0][1]) / s;
  } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const s = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2;
    w = (R[2][1] - R[1][2]) / s; x = 0.25 * s; y = (R[0][1] + R[1][0]) / s; z = (R[0][2] + R[2][0]) / s;
  } else if (R[1][1] > R[2][2]) {
    const s = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2;
    w = (R[0][2] - R[2][0]) / s; x = (R[0][1] + R[1][0]) / s; y = 0.25 * s; z = (R[1][2] + R[2][1]) / s;
  } else {
    const s = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2;
    w = (R[1][0] - R[0][1]) / s; x = (R[0][2] + R[2][0]) / s; y = (R[1][2] + R[2][1]) / s; z = 0.25 * s;
  }
  const l = Math.hypot(w, x, y, z);
  return [w / l, x / l, y / l, z / l];
}
export function matFromQuat(q) {
  const [w, x, y, z] = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}
export function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = b.map((v) => -v); }
  if (d > 0.9995) {
    const r = a.map((v, i) => v + (bb[i] - v) * t); const l = Math.hypot(...r); return r.map((v) => v / l);
  }
  const th = Math.acos(d), s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((v, i) => wa * v + wb * bb[i]);
}

// Autovalori/autovettori di una matrice simmetrica (Jacobi).
export function jacobiEigen(S) {
  const n = S.length;
  const A = S.map((r) => r.slice());
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = A[k][p], akq = A[k][q];
        A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = A[p][k], aqk = A[q][k];
        A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = V[k][p], vkq = V[k][q];
        V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return { values: A.map((r, i) => r[i]), vectors: V }; // colonne di V = autovettori
}

// Sovrapposizione ottimale (metodo di Horn): trova {R,t} con Q ≈ R P + t.
export function kabsch(P, Q) {
  const n = P.length;
  const cp = scale(P.reduce(add, [0, 0, 0]), 1 / n), cq = scale(Q.reduce(add, [0, 0, 0]), 1 / n);
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let k = 0; k < n; k++) {
    const p = sub(P[k], cp), q = sub(Q[k], cq);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += p[i] * q[j];
  }
  const [[Sxx, Sxy, Sxz], [Syx, Syy, Syz], [Szx, Szy, Szz]] = M;
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  const { values, vectors } = jacobiEigen(N);
  let best = 0; for (let i = 1; i < 4; i++) if (values[i] > values[best]) best = i;
  const q = [vectors[0][best], vectors[1][best], vectors[2][best], vectors[3][best]];
  const R = matFromQuat(q);
  const t = sub(cq, mvec(R, cp));
  let rms = 0; for (let k = 0; k < n; k++) rms += dist(add(mvec(R, P[k]), t), Q[k]) ** 2;
  return { R, t, rms: Math.sqrt(rms / n) };
}

// Media di rotazioni (via quaternioni con segno allineato).
export function averageRotation(Rs) {
  const qs = Rs.map(quatFromMat);
  const ref = qs[0];
  const acc = [0, 0, 0, 0];
  for (const q of qs) {
    const s = q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3] < 0 ? -1 : 1;
    for (let i = 0; i < 4; i++) acc[i] += s * q[i];
  }
  const l = Math.hypot(...acc);
  return matFromQuat(acc.map((v) => v / l));
}

// Ortonormalizza una matrice "quasi rotazione" (es. media di due rotazioni).
export function orthonormalize(R) {
  return averageRotation([R]);
}

export function torsion(a, b, c, d) {
  const b0 = sub(a, b), b1 = norm(sub(c, b)), b2 = sub(d, c);
  const v = sub(b0, scale(b1, dot(b0, b1)));
  const w = sub(b2, scale(b1, dot(b2, b1)));
  const x = dot(v, w), y = dot(cross(b1, v), w);
  return (Math.atan2(y, x) * 180) / Math.PI;
}
export function angle(a, b, c) {
  const u = norm(sub(a, b)), w = norm(sub(c, b));
  return (Math.acos(Math.max(-1, Math.min(1, dot(u, w)))) * 180) / Math.PI;
}

// Scompone un passo elicoidale S={R,t} (nel sistema della coppia k) in: asse u,
// angolo (con segno: + destrorsa), salita h, punto sull'asse c (vicino all'origine).
export function screw(S) {
  const q = quatFromMat(S.R);
  let w = Math.max(-1, Math.min(1, q[0]));
  let ang = 2 * Math.acos(w);
  let u = norm([q[1], q[2], q[3]]);
  if (ang > Math.PI) { ang = 2 * Math.PI - ang; u = scale(u, -1); }
  let h = dot(S.t, u);
  if (h < 0) { u = scale(u, -1); ang = -ang; h = -h; }
  // (I - R) c = t - h u, nel piano perpendicolare a u
  const a = norm(Math.abs(u[0]) < 0.9 ? cross(u, [1, 0, 0]) : cross(u, [0, 1, 0]));
  const b = cross(u, a);
  const rhs = sub(S.t, scale(u, h));
  const IRa = sub(a, mvec(S.R, a)), IRb = sub(b, mvec(S.R, b));
  // risolvi alpha*IRa + beta*IRb = rhs (minimi quadrati 2x2)
  const m11 = dot(IRa, IRa), m12 = dot(IRa, IRb), m22 = dot(IRb, IRb);
  const r1 = dot(IRa, rhs), r2 = dot(IRb, rhs);
  const det = m11 * m22 - m12 * m12;
  const alpha = (r1 * m22 - r2 * m12) / det, beta = (m11 * r2 - m12 * r1) / det;
  const c = add(scale(a, alpha), scale(b, beta));
  return { u, angle: ang, h, c };
}
