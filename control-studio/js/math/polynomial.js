/**
 * polynomial.js — Polynomial operations for transfer function manipulation
 * Coefficients stored high-degree-first: [a_n, ..., a_1, a_0]
 */
import { Complex } from './complex.js';

export function polymul(a, b) {
  if (!a.length || !b.length) return [0];
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      result[i + j] += a[i] * b[j];
  return result;
}

export function polyadd(a, b) {
  const len = Math.max(a.length, b.length);
  const r = new Array(len).fill(0);
  for (let i = 0; i < a.length; i++) r[len - a.length + i] += a[i];
  for (let i = 0; i < b.length; i++) r[len - b.length + i] += b[i];
  return trimPoly(r);
}

export function polysub(a, b) {
  return polyadd(a, b.map(c => -c));
}

export function polyscale(poly, k) {
  return poly.map(c => c * k);
}

export function trimPoly(poly) {
  let s = 0;
  while (s < poly.length - 1 && Math.abs(poly[s]) < 1e-15) s++;
  return poly.slice(s);
}

export function polydegree(poly) {
  return trimPoly(poly).length - 1;
}

export function polyvalReal(coeffs, x) {
  let r = 0;
  for (const c of coeffs) r = r * x + c;
  return r;
}

/** Convert roots to real polynomial coefficients */
export function rootsToRealPoly(roots) {
  if (!roots.length) return [1];
  let poly = [1];
  const used = new Array(roots.length).fill(false);
  for (let i = 0; i < roots.length; i++) {
    if (used[i]) continue;
    const r = roots[i];
    const re = r instanceof Complex ? r.re : r;
    const im = r instanceof Complex ? r.im : 0;
    if (Math.abs(im) < 1e-12) {
      poly = polymul(poly, [1, -re]);
    } else {
      // Find conjugate pair
      for (let j = i + 1; j < roots.length; j++) {
        if (used[j]) continue;
        const rj = roots[j];
        const rej = rj instanceof Complex ? rj.re : rj;
        const imj = rj instanceof Complex ? rj.im : 0;
        if (Math.abs(re - rej) < 1e-10 && Math.abs(im + imj) < 1e-10) {
          used[j] = true;
          break;
        }
      }
      poly = polymul(poly, [1, -2 * re, re * re + im * im]);
    }
    used[i] = true;
  }
  return poly;
}

export function zpkToTF(zeros, poles, gain) {
  const num = polyscale(rootsToRealPoly(zeros), gain);
  const den = rootsToRealPoly(poles);
  return { num, den };
}

/** Find roots via companion matrix eigenvalues */
export function polyroots(poly) {
  const p = trimPoly(poly);
  const n = p.length - 1;
  if (n <= 0) return [];
  if (n === 1) return [new Complex(-p[1] / p[0], 0)];
  if (n === 2) {
    const [a, b, c] = p;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      return [new Complex((-b + sq) / (2 * a), 0), new Complex((-b - sq) / (2 * a), 0)];
    }
    const sq = Math.sqrt(-disc);
    return [new Complex(-b / (2 * a), sq / (2 * a)), new Complex(-b / (2 * a), -sq / (2 * a))];
  }
  return qrEigenvalues(buildCompanion(p));
}

function buildCompanion(poly) {
  const n = poly.length - 1, lead = poly[0];
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) m[i][n - 1] = -poly[n - i] / lead;
  for (let i = 1; i < n; i++) m[i][i - 1] = 1;
  return m;
}

function toHessenberg(mat) {
  const n = mat.length, H = mat.map(r => [...r]);
  for (let k = 0; k < n - 2; k++) {
    let norm = 0;
    for (let i = k + 1; i < n; i++) norm += H[i][k] ** 2;
    norm = Math.sqrt(norm);
    if (norm < 1e-30) continue;
    if (H[k + 1][k] > 0) norm = -norm;
    const v = new Array(n).fill(0);
    for (let i = k + 1; i < n; i++) v[i] = H[i][k];
    v[k + 1] -= norm;
    let vnorm = 0;
    for (let i = k + 1; i < n; i++) vnorm += v[i] ** 2;
    if (vnorm < 1e-30) continue;
    const sc = 2.0 / vnorm;
    for (let j = 0; j < n; j++) {
      let d = 0; for (let i = k + 1; i < n; i++) d += v[i] * H[i][j];
      for (let i = k + 1; i < n; i++) H[i][j] -= sc * v[i] * d;
    }
    for (let i = 0; i < n; i++) {
      let d = 0; for (let j = k + 1; j < n; j++) d += H[i][j] * v[j];
      for (let j = k + 1; j < n; j++) H[i][j] -= sc * d * v[j];
    }
  }
  return H;
}

function qrEigenvalues(mat) {
  const n = mat.length;
  if (!n) return [];
  let H = toHessenberg(mat.map(r => [...r]));
  const eigs = [];
  let sz = n;
  while (sz > 0) {
    if (sz === 1) { eigs.push(new Complex(H[0][0], 0)); break; }
    let done = false;
    for (let iter = 0; iter < 500; iter++) {
      if (Math.abs(H[sz-1][sz-2]) < 1e-12*(Math.abs(H[sz-2][sz-2])+Math.abs(H[sz-1][sz-1])+1e-30)) {
        eigs.push(new Complex(H[sz-1][sz-1], 0));
        sz--; H = H.slice(0, sz).map(r => r.slice(0, sz)); done = true; break;
      }
      if (sz === 2) {
        const [a,b,c,d] = [H[0][0],H[0][1],H[1][0],H[1][1]];
        const tr = a+d, det = a*d-b*c, disc = tr*tr-4*det;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          eigs.push(new Complex((tr+sq)/2,0), new Complex((tr-sq)/2,0));
        } else {
          const sq = Math.sqrt(-disc);
          eigs.push(new Complex(tr/2,sq/2), new Complex(tr/2,-sq/2));
        }
        sz = 0; done = true; break;
      }
      // Wilkinson shift
      const a=H[sz-2][sz-2],b=H[sz-2][sz-1],c=H[sz-1][sz-2],d=H[sz-1][sz-1];
      const tr=a+d, det=a*d-b*c, disc=tr*tr-4*det;
      let shift;
      if (disc >= 0) {
        const s1=(tr+Math.sqrt(disc))/2, s2=(tr-Math.sqrt(disc))/2;
        shift = Math.abs(s1-d)<Math.abs(s2-d)?s1:s2;
      } else { shift = d; }
      for (let i=0;i<sz;i++) H[i][i]-=shift;
      const cs=[],sn=[];
      for (let i=0;i<sz-1;i++) {
        const r=Math.sqrt(H[i][i]**2+H[i+1][i]**2);
        if(r<1e-30){cs.push(1);sn.push(0);continue;}
        cs.push(H[i][i]/r); sn.push(H[i+1][i]/r);
        for(let j=0;j<sz;j++){
          const h1=H[i][j],h2=H[i+1][j];
          H[i][j]=cs[i]*h1+sn[i]*h2;
          H[i+1][j]=-sn[i]*h1+cs[i]*h2;
        }
      }
      for(let i=0;i<sz-1;i++) for(let j=0;j<sz;j++){
        const h1=H[j][i],h2=H[j][i+1];
        H[j][i]=cs[i]*h1+sn[i]*h2;
        H[j][i+1]=-sn[i]*h1+cs[i]*h2;
      }
      for(let i=0;i<sz;i++) H[i][i]+=shift;
    }
    if(!done){for(let i=0;i<sz;i++)eigs.push(new Complex(H[i][i],0));break;}
  }
  return eigs;
}

/**
 * Polynomial long division: a(s) / b(s) = q(s) remainder r(s).
 * Coefficients [high → low].
 * @returns {{ quotient: number[], remainder: number[] }}
 */
export function polydiv(a, b) {
  a = trimPoly(a.slice());
  b = trimPoly(b.slice());
  if (b.length === 1 && Math.abs(b[0]) < 1e-15) throw new Error('Division by zero polynomial');
  if (a.length < b.length) return { quotient: [0], remainder: a };

  const q = [];
  let rem = a.slice();
  while (rem.length >= b.length) {
    const coeff = rem[0] / b[0];
    q.push(coeff);
    for (let i = 0; i < b.length; i++) {
      rem[i] -= coeff * b[i];
    }
    rem.shift();
  }
  return { quotient: trimPoly(q.length > 0 ? q : [0]), remainder: trimPoly(rem.length > 0 ? rem : [0]) };
}
