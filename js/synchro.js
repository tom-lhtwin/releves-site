// Partage des données entre téléphones.
//  1) Sans réseau : « paquet » (fichier) envoyé par Quick Share, AirDrop, WhatsApp, câble…
//  2) Avec réseau : serveur de synchronisation (serveur.py) — envoi de ce qui attend, réception du reste.
// Dans les deux cas, la fusion se fait élément par élément (le plus récent gagne) : rien ne se mélange,
// chaque élément garde son auteur.
import * as db from './db.js';
import { etat, fusionner, sansChampsLocaux, lireMeta, ecrireMeta, fichiersReferences, signaler } from './donnees.js';
import { blobVersBase64, base64VersBlob } from './outils.js';

// ---------- Paquet ----------
export async function creerPaquet({ avecPhotos = true } = {}) {
  const p = etat.projet;
  const els = (await db.parIndex('elements', 'projet', p.id)).map(sansChampsLocaux);
  const ids = avecPhotos ? fichiersReferences(p.id) : new Set([p.planFichier].filter(Boolean));
  const fichiers = [];
  for (const id of ids) {
    const f = await db.get('fichiers', id);
    if (f) fichiers.push({ id: f.id, projet: f.projet, sorte: f.sorte, mime: f.mime, auteur: f.auteur, cree_le: f.cree_le, data: await blobVersBase64(f.blob) });
  }
  const paquet = {
    format: 'lh-releves-paquet', version: 1, cree_le: Date.now(),
    appareil: etat.appareil, operateur: etat.operateur,
    projet: { id: p.id, nom: p.nom }, elements: els, fichiers,
  };
  return { blob: new Blob([JSON.stringify(paquet)], { type: 'application/json' }), nbElements: els.length, nbFichiers: fichiers.length };
}

export async function importerPaquet(fichier) {
  let paquet;
  try { paquet = JSON.parse(await fichier.text()); } catch { throw new Error('Fichier illisible : ce n\'est pas un paquet de relevés'); }
  if (paquet?.format !== 'lh-releves-paquet') throw new Error('Ce fichier n\'est pas un paquet de relevés');
  let nbFichiers = 0;
  for (const f of paquet.fichiers || []) {
    if (await db.existe('fichiers', f.id)) continue;
    const blob = base64VersBlob(f.data, f.mime);
    await db.put('fichiers', { id: f.id, projet: f.projet, sorte: f.sorte, mime: f.mime, taille: blob.size, blob, cree_le: f.cree_le, auteur: f.auteur, _aEnvoyer: 0 });
    nbFichiers++;
  }
  const r = await fusionner(paquet.elements || []);
  return { ...r, nbFichiers, de: paquet.operateur, projet: paquet.projet };
}

// ---------- Serveur ----------
const cfg = { url: null, cle: '' };
let enCours = false;
let minuteur = null;
export const statut = { etat: 'inactif', message: 'Pas de serveur', dernier: null, attente: 0 };
const ecouteurs = new Set();
export const surStatut = (fn) => ecouteurs.add(fn);
function majStatut(e, message) {
  statut.etat = e;
  if (message !== undefined) statut.message = message;
  for (const f of ecouteurs) f(statut);
}

const base = () => (cfg.url ? cfg.url.replace(/\/?$/, '/') : '');
const entetes = (autres = {}) => ({ 'X-Cle': cfg.cle || '', ...autres });

export async function configurer() {
  cfg.url = await lireMeta('serveurSync', null);
  cfg.cle = await lireMeta('cleSync', '');
  if (cfg.url === null) {
    try {
      const r = await fetch('api/ping', { cache: 'no-store' });
      if (r.ok && (await r.json()).app === 'lh-releves') { cfg.url = ''; await ecrireMeta('serveurAuto', true); }
    } catch { /* pas de serveur joignable à cette adresse pour l'instant */ }
    // Serveur déjà vu ici : on le garde même hors ligne, la synchro reprendra au retour du réseau
    if (cfg.url === null && (await lireMeta('serveurAuto', false))) cfg.url = '';
  }
  await compterAttente();
  if (cfg.url === null) majStatut('inactif', 'Pas de serveur de synchro');
  else majStatut('pret', 'Serveur trouvé');
  clearInterval(minuteur);
  if (cfg.url !== null) {
    minuteur = setInterval(() => { if (document.visibilityState === 'visible') synchroniser(); }, 30000);
    synchroniser();
  }
}

export const serveurConfigure = () => cfg.url !== null;
export const urlServeur = () => cfg.url;
export const cleServeur = () => cfg.cle;

export async function reglerServeur(url, cle) {
  await ecrireMeta('serveurSync', url === '' || url == null ? null : url.trim());
  await ecrireMeta('cleSync', cle || '');
  await configurer();
}

export async function compterAttente() {
  const a = await db.clesParIndex('elements', 'aEnvoyer', 1);
  statut.attente = a.length;
  return a.length;
}

export const demanderSynchro = (() => {
  let t;
  return () => { clearTimeout(t); t = setTimeout(() => { compterAttente().then(() => majStatut(statut.etat)); synchroniser(); }, 2500); };
})();

export async function synchroniser() {
  if (cfg.url === null || enCours) return;
  if (!navigator.onLine) { await compterAttente(); majStatut('horsligne', 'Hors ligne'); return; }
  enCours = true;
  majStatut('encours', 'Synchronisation…');
  try {
    const curseur = await lireMeta('curseurSync', 0);
    const aEnvoyer = await db.parIndex('elements', 'aEnvoyer', 1);
    const r = await fetch(base() + 'api/sync', {
      method: 'POST',
      headers: entetes({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ appareil: etat.appareil, depuis: curseur, elements: aEnvoyer.map(sansChampsLocaux) }),
    });
    if (r.status === 403) throw new Error('Clé d\'équipe refusée');
    if (!r.ok) throw new Error('Serveur : erreur ' + r.status);
    const rep = await r.json();
    for (const e of aEnvoyer) {
      const cur = await db.get('elements', e.id);
      if (cur && cur.modifie_le === e.modifie_le) { cur._aEnvoyer = 0; await db.put('elements', cur); }
    }
    await fusionner(rep.elements || []);
    await ecrireMeta('curseurSync', rep.curseur || 0);
    // Fichiers : envoi de ce qui attend, puis récupération de ce qui manque pour le projet ouvert
    for (const f of await db.parIndex('fichiers', 'aEnvoyer', 1)) {
      const r2 = await fetch(base() + 'api/fichier/' + f.id, {
        method: 'PUT',
        headers: entetes({ 'Content-Type': f.mime || 'application/octet-stream', 'X-Projet': f.projet || '', 'X-Sorte': f.sorte || '' }),
        body: f.blob,
      });
      if (r2.ok) { f._aEnvoyer = 0; await db.put('fichiers', f); }
    }
    let recus = 0;
    for (const id of fichiersReferences()) {
      if (await db.existe('fichiers', id)) continue;
      const r3 = await fetch(base() + 'api/fichier/' + id, { headers: entetes() });
      if (!r3.ok) continue;
      const blob = await r3.blob();
      await db.put('fichiers', { id, projet: r3.headers.get('X-Projet') || etat.projet?.id, sorte: r3.headers.get('X-Sorte') || 'photo', mime: blob.type, taille: blob.size, blob, cree_le: Date.now(), _aEnvoyer: 0 });
      recus++;
    }
    if (recus) signaler('fichiers');
    await compterAttente();
    statut.dernier = Date.now();
    majStatut('ok', recus ? `${recus} fichier(s) reçu(s)` : 'À jour');
  } catch (e) {
    await compterAttente();
    majStatut('erreur', e.message || 'Serveur injoignable');
  } finally {
    enCours = false;
  }
}

window.addEventListener('online', () => synchroniser());
window.addEventListener('offline', () => majStatut('horsligne', 'Hors ligne'));
