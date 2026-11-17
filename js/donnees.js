// Modèle de données : tout ce qui se partage entre téléphones est un « élément » :
//   { id, type, projet, auteur, cree_le, modifie_le, modifie_par, appareil, supprime?, ...champs }
// Fusion entre téléphones : le plus récent gagne, élément par élément (modifie_le, puis appareil).
// Une suppression est un élément marqué « supprime » : elle se propage comme le reste.
import * as db from './db.js';
import { uid } from './outils.js';

export const etat = {
  appareil: null,
  operateur: null,
  projet: null,
  elements: new Map(),
  filtre: null,          // null = tout le monde, sinon Set de noms
  urls: new Map(),       // id fichier -> URL d'objet
};

const abonnes = new Set();
export const surChangement = (fn) => abonnes.add(fn);
const notifier = (quoi) => { for (const f of abonnes) { try { f(quoi); } catch (e) { console.error(e); } } };

export async function lireMeta(cle, defaut = null) {
  const m = await db.get('meta', cle);
  return m ? m.valeur : defaut;
}
export const ecrireMeta = (cle, valeur) => db.put('meta', { cle, valeur });

export async function initialiser() {
  let a = await lireMeta('appareil');
  if (!a) { a = uid(); await ecrireMeta('appareil', a); }
  etat.appareil = a;
  etat.operateur = await lireMeta('operateur');
}

export async function definirOperateur(nom) {
  etat.operateur = nom.trim();
  await ecrireMeta('operateur', etat.operateur);
  const connus = new Set(await lireMeta('operateursConnus', []));
  connus.add(etat.operateur);
  await ecrireMeta('operateursConnus', [...connus]);
  notifier('operateur');
}

export async function operateursConnus() {
  const s = new Set(await lireMeta('operateursConnus', []));
  for (const e of etat.elements.values()) {
    if (e.auteur) s.add(e.auteur);
    if (e.modifie_par) s.add(e.modifie_par);
  }
  if (etat.operateur) s.add(etat.operateur);
  return [...s].sort((a, b) => a.localeCompare(b, 'fr'));
}

// ---------- Projets ----------
export async function listerProjets() {
  const tous = await db.parIndex('elements', 'type', 'projet');
  return tous.filter((p) => !p.supprime).sort((a, b) => b.modifie_le - a.modifie_le);
}

export async function ouvrirProjet(id) {
  const p = id ? await db.get('elements', id) : null;
  if (!p || p.supprime) {
    etat.projet = null;
    etat.elements = new Map();
    await ecrireMeta('projetCourant', null);
    notifier('projet');
    return null;
  }
  const els = await db.parIndex('elements', 'projet', id);
  etat.elements = new Map(els.map((e) => [e.id, e]));
  etat.projet = p;
  await ecrireMeta('projetCourant', id);
  notifier('projet');
  return p;
}

export async function creerProjet(nom, options = {}) {
  const p = nouveau('projet', {
    nom,
    options: { scans: true, prefixe: 'Scan_', chiffres: 3, numeroDepart: 1, scanners: ['Scanner 1'], ...options },
  });
  p.projet = p.id;
  await enregistrer(p, { pasNotifier: true });
  await ouvrirProjet(p.id);
  return p;
}

// ---------- Éléments ----------
export function nouveau(type, champs = {}) {
  return { id: uid(), type, projet: etat.projet?.id ?? null, auteur: etat.operateur, cree_le: Date.now(), ...champs };
}

export async function enregistrer(rec, { pasNotifier = false } = {}) {
  rec.modifie_le = Math.max(Date.now(), (rec.modifie_le || 0) + 1);
  rec.modifie_par = etat.operateur;
  rec.appareil = etat.appareil;
  rec._aEnvoyer = 1;
  await db.put('elements', rec);
  if (etat.projet && rec.projet === etat.projet.id) {
    etat.elements.set(rec.id, rec);
    if (rec.type === 'projet') etat.projet = rec;
  }
  if (!pasNotifier) notifier(rec.type);
  return rec;
}

export async function enregistrerLot(recs) {
  const t = Date.now();
  for (const r of recs) {
    r.modifie_le = r.modifie_le || t;
    r.modifie_par = r.modifie_par || r.auteur || etat.operateur;
    r.appareil = r.appareil || etat.appareil;
    r._aEnvoyer = 1;
  }
  await db.putMany('elements', recs);
}

export const creer = (type, champs) => enregistrer(nouveau(type, champs));
export async function supprimerElement(rec) { rec.supprime = true; return enregistrer(rec); }

export function liste(type, { tous = false } = {}) {
  const r = [];
  for (const e of etat.elements.values()) {
    if (e.type !== type || e.supprime) continue;
    if (!tous && etat.filtre && !etat.filtre.has(e.auteur)) continue;
    r.push(e);
  }
  return r;
}
export const visible = (e) => !etat.filtre || etat.filtre.has(e.auteur);

export function definirFiltre(noms) {
  etat.filtre = noms && noms.size ? noms : null;
  notifier('filtre');
}

// Fusion d'éléments reçus d'un autre téléphone ou du serveur.
export async function fusionner(recus) {
  const valides = (recus || []).filter((r) => r && r.id && r.type);
  if (!valides.length) return { nb: 0, parType: {}, parAuteur: {} };
  const locaux = await db.getMany('elements', valides.map((r) => r.id));
  const aEcrire = [];
  const parType = {};
  const parAuteur = {};
  valides.forEach((r, i) => {
    const l = locaux[i];
    const plusRecent = !l || r.modifie_le > l.modifie_le || (r.modifie_le === l.modifie_le && (r.appareil || '') > (l.appareil || ''));
    if (!plusRecent) return;
    const c = {};
    for (const [k, v] of Object.entries(r)) if (!k.startsWith('_')) c[k] = v;
    c._aEnvoyer = 0;
    aEcrire.push(c);
    if (!c.supprime) {
      parType[c.type] = (parType[c.type] || 0) + 1;
      if (c.auteur) parAuteur[c.auteur] = (parAuteur[c.auteur] || 0) + 1;
    }
  });
  await db.putMany('elements', aEcrire);
  for (const c of aEcrire) {
    if (etat.projet && c.projet === etat.projet.id) {
      etat.elements.set(c.id, c);
      if (c.type === 'projet') etat.projet = c;
    }
  }
  if (aEcrire.length) notifier('fusion');
  return { nb: aEcrire.length, parType, parAuteur, recus: aEcrire };
}

export function sansChampsLocaux(r) {
  const c = {};
  for (const [k, v] of Object.entries(r)) if (!k.startsWith('_')) c[k] = v;
  return c;
}

// ---------- Fichiers (photos, plans) ----------
export async function ajouterFichier(blob, { projet = etat.projet?.id, sorte = 'photo', id = uid(), aEnvoyer = 1 } = {}) {
  await db.put('fichiers', {
    id, projet, sorte, mime: blob.type || 'application/octet-stream', taille: blob.size, blob,
    cree_le: Date.now(), auteur: etat.operateur, _aEnvoyer: aEnvoyer,
  });
  return id;
}
export const lireFichier = (id) => db.get('fichiers', id);
export const fichierExiste = (id) => db.existe('fichiers', id);

export async function urlFichier(id) {
  if (!id) return null;
  if (etat.urls.has(id)) return etat.urls.get(id);
  const f = await db.get('fichiers', id);
  if (!f) return null;
  const u = URL.createObjectURL(f.blob);
  etat.urls.set(id, u);
  return u;
}

export function fichiersReferences(projetId = etat.projet?.id) {
  const ids = new Set();
  if (etat.projet?.id === projetId && etat.projet.planFichier) ids.add(etat.projet.planFichier);
  for (const e of etat.elements.values()) {
    if (e.supprime) continue;
    if (e.type === 'epingle') for (const p of e.photos || []) ids.add(p);
    if (e.type === 'projet' && e.planFichier) ids.add(e.planFichier);
  }
  return ids;
}

export function signaler(quoi) { notifier(quoi); }
