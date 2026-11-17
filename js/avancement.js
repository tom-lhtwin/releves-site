// Suivi d'avancement : on peint au doigt les zones du jour (jaune = prévu), puis on repasse
// en vert ce qui est fait. Le bleu (périmètre) délimite l'ensemble du relevé, une fois pour toutes.
import { etat, creer, liste, supprimerElement } from './donnees.js';
import { jourISO } from './outils.js';
import { tracerTrait } from './rendu.js';

export const pinceau = { etat: 'prevu', gomme: false, taille: 44, jour: jourISO(), vue: 'jour' };

let enCours = null;
const r1 = (v) => Math.round(v * 10) / 10;

export const traitEnCours = () => enCours;

export function debut(p, vue) {
  enCours = {
    etat: pinceau.gomme ? 'gomme' : pinceau.etat,
    cible: pinceau.gomme ? pinceau.etat : undefined,
    jour: pinceau.jour,
    largeur: r1(pinceau.taille / vue.s),
    pts: [r1(p.x), r1(p.y)],
  };
}
export function suite(p, vue) {
  if (!enCours) return;
  const n = enCours.pts.length;
  if (Math.hypot(p.x - enCours.pts[n - 2], p.y - enCours.pts[n - 1]) * vue.s < 3) return;
  enCours.pts.push(r1(p.x), r1(p.y));
}
export async function fin() {
  const t = enCours;
  enCours = null;
  if (!t) return null;
  if (t.cible === undefined) delete t.cible;
  return creer('trait', t);
}
export function annuler() { enCours = null; }

export async function annulerDernier() {
  const mes = liste('trait', { tous: true }).filter((t) => t.auteur === etat.operateur).sort((a, b) => b.cree_le - a.cree_le);
  if (!mes.length) return false;
  await supprimerElement(mes[0]);
  return true;
}

export function joursAvecPeinture() {
  const s = new Set(liste('trait', { tous: true }).filter((t) => t.etat !== 'perimetre').map((t) => t.jour));
  return [...s].sort();
}

// Surfaces par rastérisation basse résolution du plan.
export function calculerStats(traits, jour, w, h, echelle) {
  const K = Math.min(1, 640 / Math.max(w, h));
  const W = Math.max(1, Math.round(w * K)), H = Math.max(1, Math.round(h * K));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  const masque = (etatV, filtreJour) => {
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, W, H);
    x.setTransform(K, 0, 0, K, 0, 0);
    x.strokeStyle = '#000';
    let rien = true;
    for (const t of traits) {
      if (filtreJour && t.jour !== filtreJour) continue;
      if (t.etat === etatV) { x.globalCompositeOperation = 'source-over'; tracerTrait(x, t); rien = false; }
      else if (t.etat === 'gomme' && t.cible === etatV) { x.globalCompositeOperation = 'destination-out'; tracerTrait(x, t); }
    }
    const m = new Uint8Array(W * H);
    if (rien) return m;
    const d = x.getImageData(0, 0, W, H).data;
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 60 ? 1 : 0;
    return m;
  };
  const P = masque('perimetre', null);
  const Yj = masque('prevu', jour), Gj = masque('fait', jour);
  const Ya = masque('prevu', null), Ga = masque('fait', null);
  let avecP = false;
  for (let i = 0; i < P.length; i++) if (P[i]) { avecP = true; break; }
  let planJ = 0, faitJ = 0, base = 0, faitG = 0;
  for (let i = 0; i < P.length; i++) {
    planJ += Yj[i] | Gj[i];
    faitJ += Gj[i];
    const b = avecP ? P[i] : (Ya[i] | Ga[i]);
    base += b;
    faitG += b & Ga[i];
  }
  const m2 = echelle ? (n) => (n / (K * K)) * echelle * echelle : null;
  return {
    jour: { prevu: planJ, fait: faitJ, pct: planJ ? faitJ / planJ : null },
    global: { base, fait: faitG, pct: base ? faitG / base : null, avecPerimetre: avecP },
    m2,
  };
}
