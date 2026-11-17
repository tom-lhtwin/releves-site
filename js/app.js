// Relevés de site — POC. Point d'entrée : écran plan, modes, feuilles et flux terrain.
import { $, $$, esc, fmtHeure, fmtDateHeure, fmtJour, jourISO, decalerJour, fmtNb, fmtDuree, couleurNom, initiales, partagerOuTelecharger, nomFichierSur, debounce } from './outils.js';
import * as D from './donnees.js';
import { etat } from './donnees.js';
import * as G from './geo.js';
import * as I from './images.js';
import * as M from './metier.js';
import * as A from './avancement.js';
import * as S from './synchro.js';
import * as R from './rendu.js';
import { Visionneuse } from './visu.js';
import { CATEGORIES, CONFIANCE, PEINTURE } from './config.js';
import { creerExemple, listeFichiersExemple, gpsDuPlan } from './exemple.js';
import { icone, ouvrirFeuille, fermerFeuille, feuilleOuverte, toast, demander, choisir, confirmer, voirPhotos } from './ui.js';

const app = {
  vue: null,
  img: null,
  cal: { ok: false },
  mode: 'plan',            // plan | placement | peinture
  selection: null,
  couches: { epingles: true, scans: true, avancement: true, calage: true },
  fix: null,
  suivreGPS: false,
  centrerAuProchainFix: false,
  derniereCategorie: 'plaque',
  rafraichir: null,        // rafraîchissement de la feuille ouverte quand les données changent
  stats: null,
};

const reconnaissance = window.SpeechRecognition || window.webkitSpeechRecognition;

// =====================================================================
// Démarrage
// =====================================================================
async function demarrer() {
  $$('[data-icone]').forEach((el) => { el.insertAdjacentHTML('afterbegin', icone(el.dataset.icone, +(el.dataset.taille || 22))); });
  await D.initialiser();
  app.derniereCategorie = await D.lireMeta('derniereCategorie', 'plaque');
  app.vue = new Visionneuse($('#plan'), dessiner);
  brancherVue();
  brancherBoutons();
  D.surChangement(surChangement);
  G.ecouterPosition(surPosition);
  S.surStatut(afficherSync);
  const id = await D.lireMeta('projetCourant');
  if (id) await D.ouvrirProjet(id);
  else await surChangement('projet');
  // Mise en cache hors ligne et synchro dès l'ouverture, sans attendre le choix de l'opérateur
  enregistrerServiceWorker();
  navigator.storage?.persist?.().catch(() => {});
  S.configurer();
  if (!etat.operateur) await choisirOperateur(true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') G.arreterSuivi();
    else if (app.suivreGPS) G.demarrerSuivi();
  });
}

function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.search.includes('nosw')) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    return;
  }
  const avait = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker :', e.message));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (avait) toast('Nouvelle version de l\'application disponible.', { duree: 0, actions: [{ libelle: 'Recharger', fn: () => location.reload() }] });
  });
}

// =====================================================================
// Réaction aux changements de données
// =====================================================================
async function surChangement(quoi) {
  if (quoi === 'fusion' && !etat.projet) {
    // Premier contact avec un collègue : ouvrir le projet reçu
    const [p] = await D.listerProjets();
    if (p) { await D.ouvrirProjet(p.id); return; }
  }
  if (quoi === 'fichiers' && etat.projet?.planFichier && !app.img) await chargerPlan();
  if (quoi === 'projet' || quoi === 'fusion') {
    const p = etat.projet;
    if (quoi === 'projet') {
      app.selection = null;
      // Projet d'exemple : position simulée (on n'est pas sur le site fictif)
      if (p?.exemple) {
        const pos = (await D.lireMeta('simulationPos:' + p.id)) || gpsDuPlan(1450, 1700);
        G.definirSimulation(pos);
      } else G.definirSimulation((await D.lireMeta('simulationForcee', false)) ? await D.lireMeta('simulationPos:' + p?.id) : null);
    }
    if (quoi === 'projet' || (p && (p.planFichier !== app.planCharge || !app.img))) await chargerPlan();
  }
  if (['projet', 'fusion', 'calage'].includes(quoi)) app.cal = G.calculerCalage(D.liste('calage', { tous: true }));
  if (['projet', 'fusion', 'trait', 'calage'].includes(quoi)) majStats();
  if (!['filtre', 'operateur', 'fichiers', 'fusion'].includes(quoi)) S.demanderSynchro();
  majEntete();
  majFiltres();
  majBoutons();
  app.vue.rendre();
  if (app.rafraichir && !document.activeElement?.closest?.('#feuille input, #feuille textarea, #feuille select')) app.rafraichir();
}

async function chargerPlan() {
  const p = etat.projet;
  app.img = null;
  app.planCharge = p?.planFichier || null;
  if (p?.planFichier) {
    const url = await D.urlFichier(p.planFichier);
    if (url) {
      try { app.img = await I.chargerImage(url); } catch (e) { console.error(e); }
    }
  }
  if (app.img) app.vue.definirImage(app.img, p.planL || app.img.naturalWidth, p.planH || app.img.naturalHeight);
  else { app.vue.img = null; app.vue.w = 0; app.vue.rendre(); }
  majVide();
}

function majVide() {
  const v = $('#vide');
  const p = etat.projet;
  if (!p) {
    v.innerHTML = `<div class="carte-vide"><h2>Relevés de site</h2>
      <p>Plan, photos, stations de scan et avancement du jour, partagés entre opérateurs, même sans réseau.</p>
      <div class="pile-boutons">
        <button class="btn principal" data-a="exemple">${icone('plan', 20)}<span>Ouvrir le projet d'exemple</span></button>
        <button class="btn" data-a="nouveau">${icone('dossier', 20)}<span>Nouveau projet</span></button>
        <button class="btn" data-a="recevoir">${icone('recevoir', 20)}<span>Recevoir un paquet d'un collègue</span></button>
      </div></div>`;
  } else if (!app.img) {
    v.innerHTML = `<div class="carte-vide"><h2>${esc(p.nom)}</h2>
      ${p.planFichier ? '<p><b>Plan en attente</b> : il arrivera à la prochaine synchronisation, ou importez-le ici.</p>' : '<p>Importez le plan de masse (PDF ou image) ou, à défaut, une capture satellite (image).</p>'}
      <div class="pile-boutons"><button class="btn principal" data-a="plan">${icone('fichier', 20)}<span>Importer le plan</span></button></div>
      <p class="aide">Sans plan, vous pouvez déjà localiser des scans et prendre des photos : ils gardent leur position GPS et se placeront après le calage.</p></div>`;
  }
  v.hidden = !!(p && app.img);
}

// =====================================================================
// En-tête, filtres, boutons
// =====================================================================
function majEntete() {
  const p = etat.projet;
  $('#nom-projet').textContent = p ? p.nom : 'Aucun projet';
  let sous = '';
  if (p) {
    const nbS = D.liste('station', { tous: true }).length, nbE = D.liste('epingle', { tous: true }).length;
    const cal = app.cal.ok ? `Calé ${app.cal.n} pts` : 'Non calé';
    sous = `${cal} · ${nbE} épingle${nbE > 1 ? 's' : ''}${p.options?.scans !== false ? ` · ${nbS} scan${nbS > 1 ? 's' : ''}` : ''}`;
  }
  $('#sous-titre').textContent = sous;
  const op = etat.operateur || '?';
  const b = $('#b-operateur');
  b.textContent = initiales(op);
  b.style.background = couleurNom(op);
  b.title = 'Opérateur : ' + op;
  afficherSync(S.statut);
}

function afficherSync(st) {
  const b = $('#b-sync');
  const att = st.attente || 0;
  let txt, cls;
  if (!S.serveurConfigure()) { txt = att ? `${att} local` : 'Local'; cls = 'gris'; }
  else if (st.etat === 'encours') { txt = 'Synchro…'; cls = 'bleu'; }
  else if (st.etat === 'erreur') { txt = att ? `${att} en attente` : 'Hors ligne'; cls = 'orange'; }
  else if (st.etat === 'horsligne') { txt = att ? `${att} en attente` : 'Hors ligne'; cls = 'orange'; }
  else { txt = att ? `${att} en attente` : 'À jour'; cls = att ? 'orange' : 'vert'; }
  b.querySelector('span:last-child').textContent = txt;
  b.className = 'pastille-sync ' + cls;
  b.title = st.message || '';
}

async function majFiltres() {
  const zone = $('#filtres');
  if (!etat.projet) { zone.innerHTML = ''; return; }
  const noms = await D.operateursConnus();
  const f = etat.filtre;
  zone.innerHTML = `<button class="puce ${!f ? 'on' : ''}" data-filtre="">Tous</button>`
    + noms.map((n) => `<button class="puce ${f?.has(n) ? 'on' : ''}" data-filtre="${esc(n)}" style="--c:${couleurNom(n)}"><i></i>${esc(n)}</button>`).join('')
    + '<span class="sep"></span>'
    + [['epingles', 'Épingles'], ['scans', 'Scans'], ['avancement', 'Avancement'], ['calage', 'Calage']]
      .filter(([k]) => k !== 'scans' || etat.projet.options?.scans !== false)
      .map(([k, l]) => `<button class="puce couche ${app.couches[k] ? 'on' : ''}" data-couche="${k}">${l}</button>`).join('');
}

function majBoutons() {
  const p = etat.projet;
  const scans = p && p.options?.scans !== false;
  $('#b-scan').hidden = !scans;
  if (scans) {
    const sc = scannerCourantSync();
    const n = M.prochainNumero(D.liste('station', { tous: true }), p.options, sc);
    $('#prochain-scan').textContent = M.nomScan(p.options, n);
  }
  $('#zone-plan').dataset.mode = app.mode;
  document.body.dataset.mode = app.mode;
  $('#flottants').hidden = !p || app.mode !== 'plan';
  $('.rangee-bas').hidden = !p;
  $('#b-scan').classList.toggle('cache', !p || app.mode !== 'plan');
  $('#b-gps').classList.toggle('actif', app.suivreGPS || G.simulationActive());
  $$('.onglets button').forEach((b) => b.classList.toggle('on', b.dataset.onglet === ongletActif()));
}

function ongletActif() {
  if (app.mode === 'peinture') return 'avancement';
  const cle = feuilleOuverte() ? $('#feuille').dataset.cle : '';
  if (cle === 'liste') return 'liste';
  if (cle === 'calage') return 'calage';
  if (cle === 'plus') return 'plus';
  return 'plan';
}

let scannerCourantCache = null;
function scannerCourantSync() {
  const liste = etat.projet?.options?.scanners || ['Scanner 1'];
  return liste.includes(scannerCourantCache) ? scannerCourantCache : liste[0];
}

// =====================================================================
// Dessin des couches
// =====================================================================
function estSelection(e) { return app.selection === e.id; }

function dessiner(ctx, vue) {
  const p = etat.projet;
  if (!p || !app.img) return;
  const cal = app.cal;
  if (app.couches.avancement || app.mode === 'peinture') {
    const traits = D.liste('trait').sort((a, b) => a.cree_le - b.cree_le);
    const jour = app.mode === 'peinture' ? (A.pinceau.vue === 'tout' ? 'tout' : A.pinceau.jour) : 'tout';
    R.dessinerAvancement(ctx, vue, traits, jour);
    R.dessinerTraitEnCours(ctx, vue, A.traitEnCours());
  }
  if (app.couches.calage) {
    for (const c of D.liste('calage', { tous: true })) {
      const s = vue.versEcran(c.x, c.y);
      const r = cal.residus?.find((x) => x.id === c.id);
      R.dessinerPointCalage(ctx, s.X, s.Y, c, cal.n > 2 ? r?.ecart ?? null : null);
    }
  }
  let selDessin = null;
  if (app.couches.scans && p.options?.scans !== false) {
    for (const st of D.liste('station')) {
      const pos = M.positionPlan(st, cal);
      if (!pos) continue;
      const s = vue.versEcran(pos.x, pos.y);
      const c = M.confianceStation(st, cal);
      const inc = M.incertitudeM(st, cal);
      const rPx = inc && cal.ok ? (inc / cal.echelle) * vue.s : 0;
      if (estSelection(st)) selDessin = () => R.dessinerStation(ctx, s.X, s.Y, st, c.code, rPx, true);
      else R.dessinerStation(ctx, s.X, s.Y, st, c.code, rPx, false);
    }
  }
  if (app.couches.epingles) {
    const eps = D.liste('epingle').map((e) => ({ e, p: M.positionPlan(e, cal) })).filter((x) => x.p).sort((a, b) => a.p.y - b.p.y);
    for (const { e, p: q } of eps) {
      const s = vue.versEcran(q.x, q.y);
      if (estSelection(e)) selDessin = () => R.dessinerEpingle(ctx, s.X, s.Y, e, true);
      else R.dessinerEpingle(ctx, s.X, s.Y, e, false);
    }
  }
  selDessin?.();
  const fix = app.fix && Date.now() - app.fix.t < 60000 ? app.fix : null;
  if (fix && cal.ok && (app.suivreGPS || fix.simule)) {
    const q = G.gpsVersPlan(cal, fix.lat, fix.lon);
    const s = vue.versEcran(q.x, q.y);
    R.dessinerGPS(ctx, s.X, s.Y, (fix.acc / cal.echelle) * vue.s, fix.simule);
  }
}

function toucher(X, Y) {
  const cal = app.cal;
  let meilleur = null, dmin = 26;
  const essayer = (e, pos, decal = 0) => {
    const s = app.vue.versEcran(pos.x, pos.y);
    const d = Math.min(Math.hypot(X - s.X, Y - s.Y), decal ? Math.hypot(X - s.X, Y - (s.Y - decal)) : Infinity);
    if (d < dmin) { dmin = d; meilleur = e; }
  };
  if (app.couches.calage) for (const c of D.liste('calage', { tous: true })) essayer(c, c);
  if (app.couches.scans && etat.projet?.options?.scans !== false) for (const st of D.liste('station')) { const p = M.positionPlan(st, cal); if (p) essayer(st, p); }
  if (app.couches.epingles) for (const e of D.liste('epingle')) { const p = M.positionPlan(e, cal); if (p) essayer(e, p, 20); }
  return meilleur;
}

// =====================================================================
// Gestes sur le plan
// =====================================================================
function brancherVue() {
  const v = app.vue;
  v.cb.tape = (p, P) => {
    if (app.mode === 'placement') { v.centrerSur(p.x, p.y); return; }
    if (app.mode !== 'plan') return;
    const e = toucher(P.X, P.Y);
    if (e) { if (e.type !== 'calage') centrerSurElement(e); ouvrirElement(e); }
    else if (feuilleOuverte() && !feuilleOuverte('demander') && !feuilleOuverte('choisir')) { fermerFeuille(); app.selection = null; v.rendre(); majBoutons(); }
  };
  v.cb.appuiLong = (p) => { if (app.mode === 'plan' && etat.projet && app.img) menuContextuel(p); };
  v.cb.peintureDebut = (p) => { A.debut(p, v); v.rendre(); };
  v.cb.peintureSuite = (p) => { A.suite(p, v); v.rendre(); };
  v.cb.peintureFin = async () => { await A.fin(); v.rendre(); };
  v.cb.peintureAnnule = () => { A.annuler(); v.rendre(); };
}

function ouvrirElement(e) {
  if (e.type === 'epingle') ouvrirEpingle(e);
  else if (e.type === 'station') ouvrirStation(e);
  else if (e.type === 'calage') ouvrirCalage();
}

async function menuContextuel(p) {
  const boutons = [
    { val: 'epingle', libelle: 'Nouvelle épingle ici', icone: 'epingle', principal: true },
  ];
  if (etat.projet.options?.scans !== false) boutons.push({ val: 'scan', libelle: 'Scan oublié, fait ici', icone: 'cible' });
  boutons.push({ val: 'coord', libelle: 'Point de calage ici (coordonnées connues)', icone: 'calage' });
  if (app.cal.ok && G.simulationActive()) boutons.push({ val: 'sim', libelle: 'Me placer ici (position simulée)', icone: 'gps' });
  const c = await choisir({ titre: 'À cet endroit', boutons });
  if (c === 'epingle') creerEpingleA(p);
  else if (c === 'scan') scanOublie(p);
  else if (c === 'coord') saisirCoordonnees(p);
  else if (c === 'sim') {
    const g = G.planVersGps(app.cal, p.x, p.y);
    G.definirSimulation(g);
    await D.ecrireMeta('simulationPos:' + etat.projet.id, g);
    toast('Position simulée déplacée ici.');
  }
}

// =====================================================================
// Mode placement : viseur au centre, on déplace le plan dessous
// =====================================================================
function placer({ message, centre, valider, annuler }) {
  fermerFeuille();
  app.mode = 'placement';
  if (centre) app.vue.centrerSur(centre.x, centre.y, Math.max(app.vue.s, 0.35));
  $('#viseur').hidden = false;
  const barre = $('#barre-mode');
  barre.innerHTML = `<div class="msg" id="msg-placement">${message}</div>
    <div class="ligne-actions"><button class="btn" data-a="annuler">Annuler</button><button class="btn principal" data-a="valider">${icone('ok', 20)}<span>Valider ici</span></button></div>`;
  barre.hidden = false;
  barre.onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    const p = app.vue.centre();
    finMode();
    if (a === 'valider') valider(p); else annuler?.();
  };
  majBoutons();
  return { maj: (m) => { const el = $('#msg-placement'); if (el) el.innerHTML = m; } };
}

function finMode() {
  app.mode = 'plan';
  $('#viseur').hidden = true;
  const barre = $('#barre-mode');
  barre.hidden = true;
  barre.innerHTML = '';
  barre.onclick = null;
  app.vue.mode = 'naviguer';
  document.body.classList.remove('mode-peinture');
  majBoutons();
  app.vue.rendre();
}

// =====================================================================
// Épingles et photos
// =====================================================================
function verifierProjet() {
  if (etat.projet) return true;
  toast('Ouvrez ou créez d\'abord un projet.', { actions: [{ libelle: 'Projets', fn: ouvrirProjets }] });
  return false;
}

function choisirFichier(sel) {
  return new Promise((resolve) => {
    const inp = $(sel);
    inp.value = '';
    const fin = (v) => { inp.onchange = null; inp.oncancel = null; resolve(v); };
    inp.onchange = () => fin(inp.multiple ? [...inp.files] : inp.files[0] || null);
    inp.oncancel = () => fin(null);
    inp.click();
  });
}

async function creerEpingleA(p) {
  const e = await D.creer('epingle', { categorie: app.derniereCategorie, titre: '', travee: '', commentaire: '', photos: [], statut: 'ouvert', x: p.x, y: p.y, src: 'pointe' });
  ouvrirEpingle(e, { nouvelle: true });
}

async function photoRapide() {
  if (!verifierProjet()) return;
  const coll = new G.Collecteur().demarrer(120000);
  const fichier = await choisirFichier('#in-photo');
  if (!fichier) { coll.arreter(); return; }
  const t = toast('Photo reçue · position en cours…', { duree: 0 });
  try {
    const [photo, exif] = await Promise.all([I.compresserPhoto(fichier), I.lireExif(fichier)]);
    let fix = coll.resultat();
    if (!fix || fix.acc > 25) fix = (await coll.attendre({ cible: 15, dureeMax: 5000 })) || fix;
    coll.arreter();
    if (!fix && exif?.lat) fix = { lat: exif.lat, lon: exif.lon, acc: exif.acc || 15, exif: true };
    const id = await D.ajouterFichier(photo.blob);
    t.fermer();
    await rattacherPhoto(id, fix);
  } catch (e) {
    coll.arreter();
    t.maj('Photo non enregistrée : ' + esc(e.message), { duree: 7000 });
  }
}

async function rattacherPhoto(idPhoto, fix) {
  const cal = app.cal;
  const pos = fix && cal.ok ? G.gpsVersPlan(cal, fix.lat, fix.lon) : null;
  if (pos) {
    const rayon = Math.max(5, fix.acc) / cal.echelle;
    let proche = null, dmin = Infinity;
    for (const e of D.liste('epingle', { tous: true })) {
      const p = M.positionPlan(e, cal);
      if (!p) continue;
      const d = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (d < rayon && d < dmin) { dmin = d; proche = e; }
    }
    if (proche) {
      app.selection = proche.id;
      app.vue.centrerSur(pos.x, pos.y, null, -app.vue.H * 0.3);
      const nom = proche.titre || CATEGORIES[proche.categorie]?.court || 'épingle';
      const c = await choisir({
        titre: 'Photo prise près d\'une épingle',
        texte: `« <b>${esc(nom)}</b> »${proche.travee ? ` (travée ${esc(proche.travee)})` : ''} est à ${fmtNb(dmin * cal.echelle)} m de vous (GPS ±${Math.round(fix.acc)} m).`,
        boutons: [{ val: 'ajouter', libelle: 'Ajouter la photo à cette épingle', principal: true, icone: 'image' }, { val: 'nouvelle', libelle: 'Créer une nouvelle épingle', icone: 'epingle' }],
      });
      if (c === 'ajouter') {
        proche.photos = [...(proche.photos || []), idPhoto];
        await D.enregistrer(proche);
        ouvrirEpingle(proche);
        toast('Photo ajoutée à l\'épingle.');
        return;
      }
      if (c === null) { toast('Photo gardée dans une nouvelle épingle.'); }
    }
  }
  const e = await D.creer('epingle', {
    categorie: app.derniereCategorie, titre: '', travee: '', commentaire: '', photos: [idPhoto], statut: 'ouvert',
    src: fix ? 'gps' : null, gps: fix ? { lat: fix.lat, lon: fix.lon, acc: Math.round(fix.acc * 10) / 10, exif: !!fix.exif } : null,
  });
  if (pos) app.vue.centrerSur(pos.x, pos.y, null, -app.vue.H * 0.3);
  ouvrirEpingle(e, { nouvelle: true });
}

function bannierePosition(e, pos) {
  const cal = app.cal;
  if (e.src === 'gps' && e.gps) {
    const acc = Math.round(e.gps.acc);
    if (pos) return `<div class="banniere ok">${icone('gps', 18)}<span>Placée par ${e.gps.exif ? 'la position de la photo' : 'GPS'} (±${acc} m${cal.emq ? ` + calage ±${Math.round(cal.emq)} m` : ''})</span></div>`;
    return `<div class="banniere attente">${icone('gps', 18)}<span>Position GPS gardée (±${acc} m). Le plan n'est pas calé : elle se placera seule après le calage.</span></div>`;
  }
  if (pos) return `<div class="banniere neutre">${icone('epingle', 18)}<span>Placée à la main sur le plan</span></div>`;
  return `<div class="banniere alerte">${icone('attention', 18)}<span>Pas de position : placez-la sur le plan.</span></div>`;
}

function auteurHtml(e) {
  const cree = `<b style="color:${couleurNom(e.auteur)}">${esc(e.auteur || '?')}</b> · ${fmtDateHeure(e.cree_le)}`;
  const modif = e.modifie_par && (e.modifie_par !== e.auteur || e.modifie_le - e.cree_le > 60000) ? ` · modifié par ${esc(e.modifie_par)} à ${fmtHeure(e.modifie_le)}` : '';
  return cree + modif;
}

function ouvrirEpingle(e, opts = {}) {
  app.selection = e.id;
  app.vue.rendre();
  const sauver = debounce(() => D.enregistrer(e), 600);
  const rendre = async () => {
    const pos = M.positionPlan(e, app.cal);
    const urls = await Promise.all((e.photos || []).map((id) => D.urlFichier(id)));
    const travees = [...new Set(D.liste('epingle', { tous: true }).map((x) => x.travee).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
    const html = `
      <div class="tete-feuille"><div><h2>${opts.nouvelle ? 'Nouvelle épingle' : esc(e.titre || CATEGORIES[e.categorie]?.nom || 'Épingle')}</h2><div class="meta">${auteurHtml(e)}</div></div>
        <button class="ico" data-a="fermer" aria-label="Fermer">${icone('fermer')}</button></div>
      ${bannierePosition(e, pos)}
      <div class="puces defile">${Object.entries(CATEGORIES).map(([k, c]) => `<button class="puce ${e.categorie === k ? 'on' : ''}" data-cat="${k}" style="--c:${c.couleur}"><i></i>${c.court}</button>`).join('')}</div>
      <div class="deux-col">
        <label class="champ"><span>Repère / équipement</span><input name="titre" value="${esc(e.titre)}" placeholder="ex. Disjoncteur 52-T1" autocomplete="off"></label>
        <label class="champ"><span>Travée</span><input name="travee" value="${esc(e.travee)}" list="dl-travees" placeholder="ex. T4" autocomplete="off"><datalist id="dl-travees">${travees.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></label>
      </div>
      <div class="champ"><span>Photos</span><div class="vignettes">
        ${urls.map((u, i) => (u ? `<button class="vignette" data-photo="${i}" style="background-image:url('${u}')" aria-label="Photo ${i + 1}"></button>` : '<div class="vignette manquante" title="Photo pas encore reçue">…</div>')).join('')}
        <button class="vignette ajout" data-a="photo">${icone('camera')}<small>Photo</small></button>
        <button class="vignette ajout" data-a="galerie">${icone('image')}<small>Galerie</small></button></div></div>
      <label class="champ"><span>Commentaire</span><div class="avec-micro"><textarea name="commentaire" rows="3" placeholder="Tapez, ou dictez avec le micro du clavier">${esc(e.commentaire)}</textarea>
        ${reconnaissance ? `<button type="button" class="ico micro" data-a="micro" aria-label="Dicter">${icone('micro')}</button>` : ''}</div></label>
      <div class="segment"><button data-statut="ouvert" class="${e.statut !== 'traite' ? 'on' : ''}">À vérifier</button><button data-statut="traite" class="${e.statut === 'traite' ? 'on' : ''}">Relevé ✓</button></div>
      <div class="actions-feuille">
        <button class="btn danger-txt" data-a="supprimer">${icone('poubelle', 18)}<span>Supprimer</span></button>
        <button class="btn" data-a="deplacer">${icone('deplacer', 18)}<span>${pos ? 'Déplacer' : 'Placer'}</span></button>
        <button class="btn principal" data-a="fermer">OK</button></div>`;
    const r = ouvrirFeuille(html, { cle: 'epingle', onFermer: () => { sauver.flush?.(); app.selection = null; app.rafraichir = null; app.vue.rendre(); majBoutons(); } });
    r.querySelectorAll('input[name], textarea[name]').forEach((inp) => inp.addEventListener('input', () => { e[inp.name] = inp.value; sauver(); }));
    r.onclick = async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.cat) {
        e.categorie = b.dataset.cat;
        app.derniereCategorie = e.categorie;
        D.ecrireMeta('derniereCategorie', e.categorie);
        r.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b));
        await D.enregistrer(e);
      } else if (b.dataset.statut) {
        e.statut = b.dataset.statut;
        r.querySelectorAll('[data-statut]').forEach((x) => x.classList.toggle('on', x === b));
        await D.enregistrer(e);
      } else if (b.dataset.photo != null) {
        const i = +b.dataset.photo;
        voirPhotos(urls.filter(Boolean), i, {
          surRetirer: async (j) => {
            if (!(await confirmer('Retirer cette photo de l\'épingle ?', 'Retirer', true))) return ouvrirEpingle(e);
            e.photos = e.photos.filter((_, k) => k !== j);
            await D.enregistrer(e);
            ouvrirEpingle(e);
          },
        });
      } else {
        const a = b.dataset.a;
        if (a === 'fermer') fermerFeuille();
        else if (a === 'photo' || a === 'galerie') {
          const f = await choisirFichier(a === 'photo' ? '#in-photo' : '#in-galerie');
          const fichiers = Array.isArray(f) ? f : f ? [f] : [];
          if (!fichiers.length) return;
          for (const fi of fichiers) {
            const ph = await I.compresserPhoto(fi);
            e.photos = [...(e.photos || []), await D.ajouterFichier(ph.blob)];
          }
          await D.enregistrer(e);
          rendre();
        } else if (a === 'micro') dicter(r.querySelector('textarea[name=commentaire]'), b, () => { e.commentaire = r.querySelector('textarea[name=commentaire]').value; sauver(); });
        else if (a === 'supprimer') {
          if (await confirmer('Supprimer cette épingle (et ses photos) pour tout le monde ?', 'Supprimer', true)) { await D.supprimerElement(e); toast('Épingle supprimée.'); }
          else ouvrirEpingle(e);
        } else if (a === 'deplacer') {
          placer({
            message: 'Placez le viseur sur l\'emplacement exact, puis validez.',
            centre: pos,
            valider: async (p) => { e.x = p.x; e.y = p.y; e.src = 'pointe'; await D.enregistrer(e); ouvrirEpingle(e); },
            annuler: () => ouvrirEpingle(e),
          });
        }
      }
    };
  };
  app.rafraichir = null;
  rendre();
}

function dicter(zone, bouton, apres) {
  try {
    const rec = new reconnaissance();
    rec.lang = 'fr-FR';
    rec.interimResults = false;
    bouton.classList.add('ecoute');
    rec.onresult = (ev) => {
      const t = [...ev.results].map((r) => r[0].transcript).join(' ');
      zone.value = (zone.value ? zone.value.trimEnd() + ' ' : '') + t;
      apres();
    };
    rec.onerror = (ev) => toast(ev.error === 'network' ? 'Dictée indisponible sans réseau : utilisez le micro du clavier.' : 'Dictée impossible (' + ev.error + ').');
    rec.onend = () => bouton.classList.remove('ecoute');
    rec.start();
  } catch (e) {
    toast('Dictée indisponible : utilisez le micro du clavier.');
  }
}

// =====================================================================
// Stations de scan
// =====================================================================
async function localiserScan() {
  if (!verifierProjet()) return;
  const btn = $('#b-scan');
  if (btn.classList.contains('occupe')) return;
  btn.classList.add('occupe');
  setTimeout(() => btn.classList.remove('occupe'), 2500);
  navigator.vibrate?.(30);
  const opts = etat.projet.options;
  const scanner = scannerCourantSync();
  const numero = M.prochainNumero(D.liste('station', { tous: true }), opts, scanner);
  const st = await D.creer('station', { numero, nom: M.nomScan(opts, numero), scanner, heure: Date.now(), origine: 'bouton', src: null });
  const t = toast(`<b>${esc(st.nom)}</b> enregistré à ${fmtHeure(st.heure)} · GPS en cours…`, { duree: 0, actions: [{ libelle: 'Annuler', fn: () => annulerStation(st) }] });
  let fix = null, err = null;
  try { fix = await G.obtenirPosition({ cible: 6, dureeMin: 1500, dureeMax: 8000 }); } catch (e) { err = e.message; }
  if (st.supprime) return;
  if (fix) {
    st.gps = { lat: fix.lat, lon: fix.lon, acc: Math.round(fix.acc * 10) / 10, nb: fix.nb };
    st.src = 'gps';
    await D.enregistrer(st);
  }
  const c = M.confianceStation(st, app.cal);
  t.maj(fix
    ? `<b>${esc(st.nom)}</b> · ${fmtHeure(st.heure)} · <span class="conf ${c.code}">${esc(c.detail)}</span>`
    : `<b>${esc(st.nom)}</b> enregistré <b>sans position</b>${err ? ` (${esc(err)})` : ''}`, {
    duree: 8000,
    actions: [
      { libelle: 'Note', fn: () => ouvrirStation(st, { note: true }) },
      { libelle: fix && app.cal.ok ? 'Corriger' : 'Pointer', fn: () => pointerStation(st) },
      { libelle: 'Annuler', fn: () => annulerStation(st) },
    ],
  });
}

async function annulerStation(st) {
  await D.supprimerElement(st);
  toast(`${esc(st.nom)} annulé.`);
}

function pointerStation(st) {
  const pos = M.positionPlan(st, app.cal);
  placer({
    message: `Placez le viseur sur la station <b>${esc(st.nom)}</b>, puis validez.`,
    centre: pos,
    valider: async (p) => { st.x = p.x; st.y = p.y; st.src = 'pointe'; await D.enregistrer(st); ouvrirStation(st); },
    annuler: () => ouvrirStation(st),
  });
}

async function scanOublie(p) {
  const opts = etat.projet.options;
  const scanner = scannerCourantSync();
  const numero = M.prochainNumero(D.liste('station', { tous: true }), opts, scanner);
  const champs = { numero, nom: M.nomScan(opts, numero), scanner, heure: Date.now(), origine: 'tardif', tardif: true, src: null };
  if (p) Object.assign(champs, { x: p.x, y: p.y, src: 'pointe' });
  const st = await D.creer('station', champs);
  ouvrirStation(st, { heure: true });
  toast('Scan ajouté après coup : indiquez son heure approximative.');
}

function ouvrirStation(st, opts = {}) {
  app.selection = st.id;
  app.vue.rendre();
  const sauver = debounce(() => D.enregistrer(st), 600);
  const rendre = () => {
    const cal = app.cal;
    const pos = M.positionPlan(st, cal);
    const c = M.confianceStation(st, cal);
    const d = new Date(st.heure || st.cree_le);
    const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    const scanners = etat.projet.options?.scanners || ['Scanner 1'];
    const srcTxt = { gps: `GPS ±${Math.round(st.gps?.acc ?? 0)} m${cal.ok ? '' : ' (plan non calé)'}`, pointe: 'pointée sur le plan', interpole: `estimée par l'heure${st.entre ? ` (entre ${st.entre.join(' et ')})` : ''}` }[st.src] || 'aucune';
    const html = `
      <div class="tete-feuille"><div><h2>${esc(st.nom || 'Station')}</h2><div class="meta">${auteurHtml(st)}${st.tardif ? ' · <b>signalé après coup</b>' : ''}</div></div>
        <button class="ico" data-a="fermer" aria-label="Fermer">${icone('fermer')}</button></div>
      <div class="banniere conf-${c.code}">${icone('cible', 18)}<span>Confiance <b>${CONFIANCE[c.code].libelle.toLowerCase()}</b> — ${esc(c.detail)}</span></div>
      <div class="deux-col">
        <label class="champ"><span>Heure du scan</span><input name="heure" type="time" step="1" value="${hh}"></label>
        <label class="champ"><span>Scanner</span><select name="scanner">${scanners.map((s) => `<option ${s === st.scanner ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <label class="champ"><span>Numéro</span><input name="numero" type="number" inputmode="numeric" value="${st.numero ?? ''}"></label>
        <label class="champ"><span>Nom</span><input name="nom" value="${esc(st.nom)}" autocomplete="off"></label>
      </div>
      <div class="champ"><span>Position : ${esc(srcTxt)}</span><div class="ligne-boutons">
        <button class="btn" data-a="pointer">${icone('deplacer', 18)}<span>${pos ? 'Corriger' : 'Pointer'} sur le plan</span></button>
        <button class="btn" data-a="gps">${icone('gps', 18)}<span>Je suis à la station</span></button>
        ${!pos ? `<button class="btn" data-a="estimer">${icone('horloge', 18)}<span>Estimer par l'heure</span></button>` : ''}</div></div>
      <div class="champ"><span>Fichier du scanner</span><div class="valeur">${st.fichier ? `${icone('lien', 16)} ${esc(st.fichier)}${st.associe_par ? ` <small>(associé par ${st.associe_par === 'nom' ? 'le nom' : 'l\'heure'})</small>` : ''}` : '<i>pas encore associé</i> — Liste › Scans › Associer les fichiers'}</div></div>
      <label class="champ"><span>Note</span><div class="avec-micro"><textarea name="note" rows="2" placeholder="ex. sur trépied haut, sous le portique…">${esc(st.note)}</textarea>
        ${reconnaissance ? `<button type="button" class="ico micro" data-a="micro">${icone('micro')}</button>` : ''}</div></label>
      <div class="champ"><span>Confiance</span><div class="segment">${[['', 'Auto'], ['bonne', 'Bonne'], ['moyenne', 'Moyenne'], ['faible', 'Faible']].map(([k, l]) => `<button data-conf="${k}" class="${(st.confianceForcee || '') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="actions-feuille">
        <button class="btn danger-txt" data-a="supprimer">${icone('poubelle', 18)}<span>Supprimer</span></button>
        <button class="btn principal" data-a="fermer">OK</button></div>`;
    const r = ouvrirFeuille(html, { cle: 'station', onFermer: () => { app.selection = null; app.rafraichir = null; app.vue.rendre(); majBoutons(); } });
    r.querySelectorAll('input[name], textarea[name], select[name]').forEach((inp) => inp.addEventListener(inp.tagName === 'SELECT' || inp.type === 'time' ? 'change' : 'input', () => {
      if (inp.name === 'heure') {
        const [h, mi, s] = inp.value.split(':').map(Number);
        const t = new Date(st.heure || st.cree_le);
        t.setHours(h || 0, mi || 0, s || 0, 0);
        st.heure = t.getTime();
      } else if (inp.name === 'numero') st.numero = inp.value === '' ? null : parseInt(inp.value, 10);
      else st[inp.name] = inp.value;
      sauver();
    }));
    if (opts.note) setTimeout(() => r.querySelector('textarea[name=note]')?.focus(), 80);
    if (opts.heure) setTimeout(() => r.querySelector('input[name=heure]')?.focus(), 80);
    opts = {};
    r.onclick = async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.conf != null) {
        st.confianceForcee = b.dataset.conf || null;
        await D.enregistrer(st);
        rendre();
        return;
      }
      const a = b.dataset.a;
      if (a === 'fermer') fermerFeuille();
      else if (a === 'pointer') pointerStation(st);
      else if (a === 'micro') dicter(r.querySelector('textarea[name=note]'), b, () => { st.note = r.querySelector('textarea[name=note]').value; sauver(); });
      else if (a === 'gps') {
        const t = toast('Mesure GPS…', { duree: 0 });
        try {
          const fix = await G.obtenirPosition({ cible: 6, dureeMin: 1500, dureeMax: 8000 });
          if (!fix) throw new Error('pas de position');
          st.gps = { lat: fix.lat, lon: fix.lon, acc: Math.round(fix.acc * 10) / 10, nb: fix.nb };
          st.src = 'gps';
          if (Date.now() - (st.heure || 0) > 10 * 60e3) st.tardif = true;
          await D.enregistrer(st);
          t.maj(`Position GPS ±${Math.round(fix.acc)} m enregistrée.`);
          rendre();
        } catch (e) { t.maj('GPS impossible : ' + esc(e.message), { duree: 6000 }); }
      } else if (a === 'estimer') {
        const p = M.interpolerPosition(st.heure, D.liste('station', { tous: true }).filter((x) => x.id !== st.id), app.cal);
        if (!p) { toast('Aucun scan localisé à moins de 15 min : pointez-le à la main.'); return; }
        Object.assign(st, { x: p.x, y: p.y, src: 'interpole', entre: p.entre });
        await D.enregistrer(st);
        rendre();
      } else if (a === 'supprimer') {
        if (await confirmer(`Supprimer ${st.nom} ?`, 'Supprimer', true)) { await D.supprimerElement(st); toast('Station supprimée.'); }
        else ouvrirStation(st);
      }
    };
  };
  app.rafraichir = null;
  rendre();
}

// =====================================================================
// Calage GPS du plan
// =====================================================================
function ouvrirCalage() {
  const rendre = () => {
    const cal = app.cal;
    const pts = D.liste('calage', { tous: true }).sort((a, b) => a.cree_le - b.cree_le);
    let etatTxt;
    if (cal.ok) {
      etatTxt = `<div class="carte-etat ${cal.qualite === 'bonne' ? 'ok' : cal.qualite === 'mauvaise' ? 'alerte' : 'attente'}">
        <b>Plan calé</b> · ${cal.n} points · ${cal.emq != null ? `écart moyen ${fmtNb(cal.emq, 1)} m` : 'pas encore de contrôle (ajoutez un 3e point)'}<br>
        <small>1 px du plan = ${fmtNb(cal.echelle * 100, 1)} cm · nord à ${fmtNb(cal.nord)}° · points étalés sur ${fmtNb(cal.etendue)} m · qualité : ${cal.qualite}</small></div>`;
    } else etatTxt = `<div class="carte-etat attente"><b>Plan non calé</b> — ${esc(cal.raison || '')}</div>`;
    const html = `
      <div class="tete-feuille"><div><h2>Calage GPS du plan</h2><div class="meta">Pour que photos et scans se placent tout seuls</div></div>
        <button class="ico" data-a="fermer" aria-label="Fermer">${icone('fermer')}</button></div>
      ${etatTxt}
      <p class="aide">Placez-vous sur un point <b>reconnaissable</b> sur le plan (portail, angle de bâtiment, pied de pylône), appuyez sur « Je suis ici » puis visez ce point. Deux points suffisent, trois permettent de contrôler. Prenez-les <b>éloignés</b> les uns des autres.</p>
      <div class="pile-boutons">
        <button class="btn principal" data-a="ici">${icone('gps', 20)}<span>Je suis ici</span></button>
        <button class="btn" data-a="coord">${icone('calage', 20)}<span>Saisir des coordonnées connues</span></button></div>
      <div class="liste">${pts.map((p) => {
        const r = cal.residus?.find((x) => x.id === p.id);
        return `<div class="ligne-liste ${p.actif === false ? 'inactif' : ''}">
          <span class="pastille" style="background:#BE185D"></span>
          <div class="ll-txt"><b>${esc(p.nom || 'Point')}</b><small>${p.source === 'saisie' ? 'coordonnées saisies' : p.source === 'simulation' ? 'position simulée' : `GPS ±${fmtNb(p.acc || 0)} m`} · ${esc(p.auteur || '')} ${fmtHeure(p.cree_le)}${cal.n > 2 && r ? ` · écart <b>${fmtNb(r.ecart, 1)} m</b>` : ''}</small></div>
          <button class="btn petit" data-actif="${p.id}">${p.actif === false ? 'Réactiver' : 'Écarter'}</button>
          <button class="ico" data-suppr="${p.id}" aria-label="Supprimer">${icone('poubelle', 18)}</button></div>`;
      }).join('') || '<p class="aide">Aucun point pour l\'instant.</p>'}</div>`;
    const r = ouvrirFeuille(html, { cle: 'calage', onFermer: () => { app.rafraichir = null; majBoutons(); } });
    r.onclick = async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.actif) {
        const p = etat.elements.get(b.dataset.actif);
        p.actif = p.actif === false;
        await D.enregistrer(p);
        return;
      }
      if (b.dataset.suppr) {
        const p = etat.elements.get(b.dataset.suppr);
        if (await confirmer(`Supprimer le point « ${p.nom} » ?`, 'Supprimer', true)) await D.supprimerElement(p);
        ouvrirCalage();
        return;
      }
      const a = b.dataset.a;
      if (a === 'fermer') fermerFeuille();
      else if (a === 'ici') jeSuisIci();
      else if (a === 'coord') placer({ message: 'Placez le viseur sur le point dont vous connaissez les coordonnées.', valider: (p) => saisirCoordonnees(p), annuler: ouvrirCalage });
    };
    app.rafraichir = rendre;
  };
  if (!etat.projet || !app.img) { toast('Importez d\'abord un plan.'); return; }
  rendre();
  majBoutons();
}

function jeSuisIci() {
  const coll = new G.Collecteur().demarrer(90000);
  const h = placer({
    message: 'Visez <b>votre position</b> sur le plan · GPS : recherche…',
    valider: async (p) => {
      const t = toast('Calage : mesure GPS…', { duree: 0 });
      let fix = coll.resultat();
      if (!fix || fix.acc > 6) fix = (await coll.attendre({ cible: 6, dureeMax: 6000 })) || fix;
      coll.arreter();
      t.fermer();
      if (!fix) { toast('Pas de position GPS : point non enregistré. Réessayez à découvert.', { duree: 6000 }); ouvrirCalage(); return; }
      const n = D.liste('calage', { tous: true }).length + 1;
      const v = await demander({ titre: 'Point de calage', texte: `GPS ±${fmtNb(fix.acc)} m (${fix.nb} mesure${fix.nb > 1 ? 's' : ''}).`, champs: [{ nom: 'nom', libelle: 'Nom du point (facultatif)', placeholder: 'ex. Portail', valeur: '' }], ok: 'Enregistrer' });
      if (v === null) { ouvrirCalage(); return; }
      await D.creer('calage', { x: p.x, y: p.y, lat: fix.lat, lon: fix.lon, acc: Math.round(fix.acc * 10) / 10, nom: v.nom || `Point ${n}`, actif: true, source: fix.simule ? 'simulation' : 'gps' });
      ouvrirCalage();
      messageCalage();
    },
    annuler: () => { coll.arreter(); ouvrirCalage(); },
  });
  coll.surMesure((e, r) => h.maj(`Visez <b>votre position</b> sur le plan · GPS ±${Math.round(r.acc)} m (${r.nb} mesure${r.nb > 1 ? 's' : ''})`));
  if (coll.erreur) h.maj(`Visez votre position sur le plan · <b>${esc(coll.erreur)}</b>`);
}

async function saisirCoordonnees(p) {
  const n = D.liste('calage', { tous: true }).length + 1;
  const v = await demander({
    titre: 'Coordonnées du point',
    texte: 'Collez « latitude, longitude » en degrés décimaux (par exemple copiées depuis une carte en ligne, clic droit sur le point).',
    champs: [{ nom: 'nom', libelle: 'Nom', valeur: `Point ${n}` }, { nom: 'coord', libelle: 'Latitude, longitude', placeholder: '14.60941, -60.99322', attrs: 'inputmode="decimal"' }],
    ok: 'Enregistrer',
  });
  if (!v) { ouvrirCalage(); return; }
  const c = G.lireCoordonnees(v.coord);
  if (!c) { toast('Coordonnées illisibles. Format attendu : 14.60941, -60.99322'); ouvrirCalage(); return; }
  await D.creer('calage', { x: p.x, y: p.y, lat: c.lat, lon: c.lon, acc: 2, nom: v.nom || `Point ${n}`, actif: true, source: 'saisie' });
  ouvrirCalage();
  messageCalage();
}

function messageCalage() {
  const c = app.cal;
  if (!c.ok) toast('Premier point enregistré. Ajoutez-en un deuxième, éloigné du premier.', { duree: 6000 });
  else if (c.n === 2) toast(`Plan calé avec 2 points (1 px = ${fmtNb(c.echelle * 100, 1)} cm). Un 3e point permettra de vérifier.`, { duree: 6000 });
  else toast(`Plan calé · ${c.n} points · écart moyen ${fmtNb(c.emq, 1)} m (${c.qualite}).`, { duree: 6000 });
}

// =====================================================================
// Position du téléphone (point bleu)
// =====================================================================
let avertiLoin = false;
function surPosition(fix) {
  app.fix = fix;
  const cal = app.cal;
  if (cal.ok && app.img) {
    const p = G.gpsVersPlan(cal, fix.lat, fix.lon);
    const dehors = p.x < -0.5 * app.vue.w || p.y < -0.5 * app.vue.h || p.x > 1.5 * app.vue.w || p.y > 1.5 * app.vue.h;
    if (dehors && !avertiLoin && !fix.simule && app.suivreGPS) {
      avertiLoin = true;
      const g = G.planVersGps(cal, app.vue.w / 2, app.vue.h / 2);
      const km = G.distanceM(fix.lat, fix.lon, g.lat, g.lon) / 1000;
      toast(`Vous êtes à ${fmtNb(km, km < 10 ? 1 : 0)} km du plan : le point bleu est hors du plan.`, { duree: 6000 });
    }
    if (app.centrerAuProchainFix) {
      app.centrerAuProchainFix = false;
      if (!dehors) app.vue.centrerSur(p.x, p.y, Math.max(app.vue.s, 0.3));
    }
  } else if (app.centrerAuProchainFix) {
    app.centrerAuProchainFix = false;
    toast(`Position reçue (±${Math.round(fix.acc)} m), mais le plan n'est pas calé.`, { actions: [{ libelle: 'Caler', fn: ouvrirCalage }] });
  }
  app.vue.rendre();
}

function basculerGPS() {
  if (!verifierProjet()) return;
  if (G.simulationActive()) {
    const f = G.dernierePosition(1e12);
    if (f && app.cal.ok) { const p = G.gpsVersPlan(app.cal, f.lat, f.lon); app.vue.centrerSur(p.x, p.y); }
    toast('Position simulée (projet d\'exemple). Appui long sur le plan › « Me placer ici » pour la déplacer.', { duree: 5000 });
    return;
  }
  if (!G.gpsPossible()) { toast('Pas de GPS disponible sur cet appareil.'); return; }
  app.suivreGPS = !app.suivreGPS;
  if (app.suivreGPS) {
    app.centrerAuProchainFix = true;
    G.demarrerSuivi(() => { app.suivreGPS = false; majBoutons(); toast('Accès à la position refusé : autorisez-le dans les réglages du navigateur.', { duree: 7000 }); });
    if (!window.isSecureContext) toast('Le GPS exige une adresse sécurisée (https). Voir le README.', { duree: 7000 });
  } else G.arreterSuivi();
  majBoutons();
  app.vue.rendre();
}

// =====================================================================
// Avancement (peinture)
// =====================================================================
function entrerPeinture() {
  if (!etat.projet || !app.img) { toast('Importez d\'abord un plan.'); return; }
  fermerFeuille();
  app.mode = 'peinture';
  app.vue.mode = 'peindre';
  document.body.classList.add('mode-peinture');
  app.couches.avancement = true;
  rendreBarrePeinture();
  majBoutons();
  majStats();
  app.vue.rendre();
}

function rendreBarrePeinture() {
  const p = A.pinceau;
  const barre = $('#barre-mode');
  const tailles = [[22, 'Fin'], [44, 'Moyen'], [90, 'Large']];
  barre.innerHTML = `
    <div class="peinture">
      <div class="ligne-jour">
        <button class="ico" data-a="jour-prec" aria-label="Jour précédent">${icone('gauche')}</button>
        <button class="jour" data-a="jour-auj">${esc(fmtJour(p.jour))}</button>
        <button class="ico" data-a="jour-suiv" aria-label="Jour suivant">${icone('droite')}</button>
        <div class="segment petit"><button data-vue="jour" class="${p.vue === 'jour' ? 'on' : ''}">Jour</button><button data-vue="tout" class="${p.vue === 'tout' ? 'on' : ''}">Tout</button></div>
      </div>
      <div class="stats-av" id="stats-av">${texteStats()}</div>
      <div class="ligne-outils">
        ${Object.entries(PEINTURE).map(([k, c]) => `<button class="pot ${p.etat === k ? 'on' : ''}" data-etat="${k}" style="--c:${c.couleur}"><i></i>${c.nom}</button>`).join('')}
        <button class="ico ${p.gomme ? 'on' : ''}" data-a="gomme" aria-label="Gomme" title="Gomme (efface la couleur choisie)">${icone('gomme')}</button>
        <button class="ico" data-a="taille" aria-label="Taille du pinceau" title="Taille">${'<span class="taille-pinceau" style="--t:' + Math.round(p.taille / 4.5) + 'px"></span>'}</button>
        <button class="ico" data-a="annuler" aria-label="Annuler mon dernier trait">${icone('annuler')}</button>
      </div>
      <div class="ligne-fin"><small>${p.gomme ? `Gomme sur « ${PEINTURE[p.etat].nom} »` : `Pinceau ${tailles.find((t) => t[0] === p.taille)?.[1].toLowerCase() || ''} · ${PEINTURE[p.etat].nom.toLowerCase()}`} — un doigt peint, deux doigts déplacent</small>
        <button class="btn principal" data-a="terminer">Terminer</button></div>
    </div>`;
  barre.hidden = false;
  barre.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.etat) { p.etat = b.dataset.etat; }
    else if (b.dataset.vue) { p.vue = b.dataset.vue; app.vue.rendre(); }
    else {
      const a = b.dataset.a;
      if (a === 'jour-prec') p.jour = decalerJour(p.jour, -1);
      else if (a === 'jour-suiv') p.jour = decalerJour(p.jour, 1);
      else if (a === 'jour-auj') p.jour = jourISO();
      else if (a === 'gomme') p.gomme = !p.gomme;
      else if (a === 'taille') { const i = tailles.findIndex((t) => t[0] === p.taille); p.taille = tailles[(i + 1) % tailles.length][0]; }
      else if (a === 'annuler') { if (!(await A.annulerDernier())) toast('Aucun trait à annuler.'); }
      else if (a === 'terminer') { finMode(); return; }
      if (a?.startsWith('jour')) { majStats(); app.vue.rendre(); }
    }
    rendreBarrePeinture();
  };
}

function texteStats() {
  const s = app.stats;
  if (!s) return 'Peignez en jaune les zones prévues aujourd\'hui, repassez en vert ce qui est fait.';
  const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)} %`);
  const aire = (n) => (s.m2 ? `${fmtNb(s.m2(n))} m²` : '');
  const jour = s.jour.prevu ? `<b>Jour : ${pct(s.jour.pct)}</b> fait${s.m2 ? ` (${aire(s.jour.fait)} sur ${aire(s.jour.prevu)})` : ''}` : 'Rien de prévu ce jour';
  const glob = s.global.base ? `<b>Global : ${pct(s.global.pct)}</b> ${s.global.avecPerimetre ? 'du périmètre' : 'des zones prévues'}${s.m2 ? ` (${aire(s.global.fait)} / ${aire(s.global.base)})` : ''}` : '';
  return [jour, glob].filter(Boolean).join(' · ');
}

const majStats = debounce(() => {
  if (!etat.projet || !app.img) { app.stats = null; return; }
  const traits = D.liste('trait', { tous: true }).sort((a, b) => a.cree_le - b.cree_le);
  app.stats = traits.length ? A.calculerStats(traits, A.pinceau.jour, app.vue.w, app.vue.h, app.cal.ok ? app.cal.echelle : null) : null;
  const el = $('#stats-av');
  if (el) el.innerHTML = texteStats();
}, 250);

// =====================================================================
// Liste (épingles, scans, à placer)
// =====================================================================
let ongletListe = 'epingles';
let filtreCategories = new Set();

function ouvrirListe(onglet) {
  if (!verifierProjet()) return;
  if (onglet) ongletListe = onglet;
  const avecScans = etat.projet.options?.scans !== false;
  if (!avecScans && ongletListe === 'scans') ongletListe = 'epingles';
  const rendre = () => {
    const cal = app.cal;
    const eps = D.liste('epingle').sort((a, b) => b.cree_le - a.cree_le);
    const sts = D.liste('station').sort((a, b) => (a.heure || 0) - (b.heure || 0));
    const aPlacer = [...eps.filter((e) => !M.positionPlan(e, cal)), ...sts.filter((s) => !M.positionPlan(s, cal))];
    let corps = '';
    if (ongletListe === 'epingles') {
      const vis = filtreCategories.size ? eps.filter((e) => filtreCategories.has(e.categorie)) : eps;
      corps = `<div class="puces defile">${Object.entries(CATEGORIES).map(([k, c]) => `<button class="puce ${filtreCategories.has(k) ? 'on' : ''}" data-fcat="${k}" style="--c:${c.couleur}"><i></i>${c.court} <small>${eps.filter((e) => e.categorie === k).length}</small></button>`).join('')}</div>
        <div class="liste">${vis.map((e) => {
          const c = CATEGORIES[e.categorie] || CATEGORIES.photo;
          const pos = M.positionPlan(e, cal);
          return `<button class="ligne-liste" data-ep="${e.id}"><span class="pastille" style="background:${c.couleur}">${c.lettre}</span>
            <div class="ll-txt"><b>${esc(e.titre || c.nom)}${e.travee ? ` <span class="travee">${esc(e.travee)}</span>` : ''}</b>
            <small>${esc(e.auteur || '?')} · ${fmtDateHeure(e.cree_le)}${(e.photos || []).length ? ` · ${e.photos.length} photo${e.photos.length > 1 ? 's' : ''}` : ''}${e.statut === 'traite' ? ' · relevé ✓' : ''}${!pos ? ' · <b class="txt-alerte">à placer</b>' : ''}</small>
            ${e.commentaire ? `<small class="extrait">${esc(e.commentaire)}</small>` : ''}</div></button>`;
        }).join('') || '<p class="aide">Aucune épingle. Appui long sur le plan, ou bouton photo.</p>'}</div>
        <div class="ligne-boutons"><button class="btn" data-a="csv-epingles">${icone('partager', 18)}<span>Exporter les épingles (CSV)</span></button></div>`;
    } else if (ongletListe === 'scans') {
      const compte = { bonne: 0, moyenne: 0, faible: 0, aucune: 0 };
      for (const s of sts) compte[M.confianceStation(s, cal).code]++;
      const sansFichier = sts.filter((s) => !s.fichier).length;
      corps = `<div class="resume-conf">${Object.entries(compte).map(([k, n]) => `<span class="conf ${k}"><b>${n}</b> ${CONFIANCE[k].libelle.toLowerCase()}</span>`).join('')}<span class="conf"><b>${sts.length - sansFichier}</b>/${sts.length} avec fichier</span></div>
        <div class="ligne-boutons">
          <button class="btn" data-a="oublie">${icone('cible', 18)}<span>Scan oublié</span></button>
          <button class="btn" data-a="associer">${icone('lien', 18)}<span>Associer les fichiers du scanner</span></button>
          ${compte.aucune ? `<button class="btn" data-a="estimer">${icone('horloge', 18)}<span>Estimer par l'heure (${compte.aucune} sans position)</span></button>` : ''}
          <button class="btn" data-a="csv-scans">${icone('partager', 18)}<span>Exporter pour le recalage (CSV)</span></button></div>
        <div class="liste">${sts.map((s) => {
          const c = M.confianceStation(s, cal);
          return `<button class="ligne-liste" data-st="${s.id}"><span class="pastille anneau" style="--c:${CONFIANCE[c.code].couleur}">${esc(String(s.numero ?? '?'))}</span>
            <div class="ll-txt"><b>${esc(s.nom || '?')} <small>${s.heure ? fmtHeure(s.heure) : ''}</small></b>
            <small>${esc(s.auteur || '?')} · <span class="conf ${c.code}">${esc(c.detail)}</span>${s.fichier ? ` · ${icone('lien', 12)} ${esc(s.fichier)}` : ''}${s.tardif ? ' · après coup' : ''}</small>
            ${s.note ? `<small class="extrait">${esc(s.note)}</small>` : ''}</div></button>`;
        }).join('') || '<p class="aide">Aucun scan. Appuyez sur « Localiser ce scan » à chaque station.</p>'}</div>`;
    } else {
      corps = `<p class="aide">Éléments sans position sur le plan${cal.ok ? '' : ' (le plan n\'est pas calé : ce qui a une position GPS se placera seul après le calage)'}.</p>
        <div class="liste">${aPlacer.map((x) => `<div class="ligne-liste"><span class="pastille" style="background:${x.type === 'station' ? '#6B7280' : (CATEGORIES[x.categorie] || CATEGORIES.photo).couleur}">${x.type === 'station' ? esc(String(x.numero ?? '?')) : (CATEGORIES[x.categorie] || CATEGORIES.photo).lettre}</span>
          <div class="ll-txt"><b>${esc(x.type === 'station' ? x.nom : x.titre || CATEGORIES[x.categorie]?.nom || 'Épingle')}</b><small>${esc(x.auteur || '?')} · ${fmtDateHeure(x.heure || x.cree_le)}${x.gps ? ` · GPS ±${Math.round(x.gps.acc)} m` : ' · sans GPS'}</small></div>
          <button class="btn petit" data-placer="${x.id}">Placer</button><button class="btn petit" data-ouvrir="${x.id}">Ouvrir</button></div>`).join('') || '<p class="aide">Tout est placé.</p>'}</div>`;
    }
    const html = `
      <div class="tete-feuille"><div class="segment onglets-liste">
        <button data-ol="epingles" class="${ongletListe === 'epingles' ? 'on' : ''}">Épingles <small>${eps.length}</small></button>
        ${avecScans ? `<button data-ol="scans" class="${ongletListe === 'scans' ? 'on' : ''}">Scans <small>${sts.length}</small></button>` : ''}
        <button data-ol="aplacer" class="${ongletListe === 'aplacer' ? 'on' : ''}">À placer <small>${aPlacer.length}</small></button></div>
        <button class="ico" data-a="fermer" aria-label="Fermer">${icone('fermer')}</button></div>
      ${etat.filtre ? `<div class="banniere neutre">${icone('personne', 18)}<span>Filtré : ${esc([...etat.filtre].join(', '))}</span></div>` : ''}
      ${corps}`;
    const r = ouvrirFeuille(html, { haute: true, cle: 'liste', onFermer: () => { app.rafraichir = null; majBoutons(); } });
    r.onclick = async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if (d.ol) { ongletListe = d.ol; rendre(); return; }
      if (d.fcat) { filtreCategories.has(d.fcat) ? filtreCategories.delete(d.fcat) : filtreCategories.add(d.fcat); rendre(); return; }
      const el = etat.elements.get(d.ep || d.st || d.placer || d.ouvrir);
      if (d.ep || d.st || d.ouvrir) { centrerSurElement(el); ouvrirElement(el); return; }
      if (d.placer) {
        placer({
          message: `Placez le viseur sur <b>${esc(el.nom || el.titre || 'l\'élément')}</b>, puis validez.`,
          valider: async (p) => { el.x = p.x; el.y = p.y; el.src = 'pointe'; await D.enregistrer(el); ouvrirListe('aplacer'); },
          annuler: () => ouvrirListe('aplacer'),
        });
        return;
      }
      const a = d.a;
      if (a === 'fermer') fermerFeuille();
      else if (a === 'oublie') placer({ message: 'Placez le viseur à l\'endroit de la station oubliée (ou Annuler pour la laisser sans position).', valider: (p) => scanOublie(p), annuler: () => scanOublie(null) });
      else if (a === 'associer') ouvrirAssociation();
      else if (a === 'estimer') estimerManquantes();
      else if (a === 'csv-scans') exporterCSV('scans');
      else if (a === 'csv-epingles') exporterCSV('epingles');
    };
    app.rafraichir = rendre;
    majBoutons();
  };
  rendre();
}

function centrerSurElement(e) {
  const p = e.type === 'calage' ? e : M.positionPlan(e, app.cal);
  if (p) app.vue.centrerSur(p.x, p.y, Math.max(app.vue.s, 0.35), -app.vue.H * 0.3);
}

async function estimerManquantes() {
  const toutes = D.liste('station', { tous: true });
  let n = 0;
  for (const s of toutes) {
    if (M.positionPlan(s, app.cal) || s.gps) continue;
    const p = M.interpolerPosition(s.heure, toutes.filter((x) => x.id !== s.id), app.cal);
    if (!p) continue;
    Object.assign(s, { x: p.x, y: p.y, src: 'interpole', entre: p.entre });
    await D.enregistrer(s, { pasNotifier: true });
    n++;
  }
  D.signaler('station');
  toast(n ? `${n} position${n > 1 ? 's' : ''} estimée${n > 1 ? 's' : ''} par l'heure (confiance faible).` : 'Aucune estimation possible (pas de scan localisé à moins de 15 min).');
}

async function exporterCSV(quoi) {
  const p = etat.projet;
  const contenu = quoi === 'scans' ? M.csvStations(D.liste('station', { tous: true }), app.cal) : M.csvEpingles(D.liste('epingle', { tous: true }), app.cal);
  const nom = `${nomFichierSur(p.nom)}-${quoi === 'scans' ? 'stations' : 'epingles'}-${jourISO()}.csv`;
  const r = await partagerOuTelecharger(new Blob([contenu], { type: 'text/csv' }), nom, nom);
  if (r === 'telecharge') toast(`Fichier ${esc(nom)} téléchargé.`);
}

// =====================================================================
// Association après coup avec les fichiers du scanner
// =====================================================================
function ouvrirAssociation() {
  let fichiers = [];
  const html = `
    <div class="tete-feuille"><div><h2>Associer les fichiers du scanner</h2><div class="meta">Après coup, par le nom ou par l'heure</div></div>
      <button class="ico" data-a="fermer" aria-label="Fermer">${icone('fermer')}</button></div>
    <p class="aide">Choisissez les fichiers de scan (seuls leurs <b>noms et heures</b> sont lus, rien n'est envoyé), ou collez une liste « nom date heure » par ligne. L'application estime l'écart d'horloge du scanner, associe chaque fichier à la station la plus proche dans le temps, et signale ce qui reste seul.</p>
    <div class="ligne-boutons"><button class="btn" data-a="choisir">${icone('fichier', 18)}<span>Choisir les fichiers…</span></button>
      ${etat.projet.exemple ? `<button class="btn" data-a="exemple">${icone('liste', 18)}<span>Liste d'exemple</span></button>` : ''}</div>
    <label class="champ"><span>Liste des fichiers</span><textarea name="liste" rows="5" placeholder="Scan_012.fls 20/11/2026 10:42:13"></textarea></label>
    <div class="deux-col">
      <label class="champ"><span>Tolérance (minutes)</span><input name="tol" type="number" inputmode="numeric" value="10" min="1" max="60"></label>
      <label class="champ"><span>Jour (si la liste n'a que l'heure)</span><input name="jour" type="date" value="${jourISO()}"></label>
    </div>
    <label class="case"><input type="checkbox" name="renommer" checked> <span>Renommer les stations comme les fichiers</span></label>
    <label class="case"><input type="checkbox" name="creer" checked> <span>Créer les scans jamais signalés (position estimée par l'heure)</span></label>
    <div class="actions-feuille"><button class="btn" data-a="retour">Retour</button><button class="btn principal" data-a="analyser">Analyser</button></div>
    <div id="resultat-assoc"></div>`;
  const r = ouvrirFeuille(html, { haute: true, cle: 'assoc' });
  const zone = r.querySelector('textarea[name=liste]');
  let analyse = null;
  r.onclick = async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'fermer') fermerFeuille();
    else if (a === 'retour') ouvrirListe('scans');
    else if (a === 'exemple') { zone.value = listeFichiersExemple(); fichiers = []; }
    else if (a === 'choisir') {
      const f = await choisirFichier('#in-fichiers-scan');
      if (f?.length) {
        fichiers = f.map((x) => ({ nom: x.name, t: x.lastModified }));
        zone.value = f.map((x) => `${x.name} ${new Date(x.lastModified).toLocaleString('fr-FR')}`).join('\n');
      }
    } else if (a === 'analyser') {
      const liste = fichiers.length && zone.value.split('\n').length === fichiers.length ? fichiers : M.lireListeFichiers(zone.value, r.querySelector('[name=jour]').value || jourISO());
      if (!liste.length) { toast('Liste vide.'); return; }
      const tol = Math.max(1, +r.querySelector('[name=tol]').value || 10) * 60e3;
      const stations = D.liste('station', { tous: true });
      analyse = M.associerFichiers(stations, liste, tol);
      const res = r.querySelector('#resultat-assoc');
      res.innerHTML = `<div class="carte-etat ok"><b>${analyse.paires.length}</b> association${analyse.paires.length > 1 ? 's' : ''} · écart typique fichier / bouton : <b>${fmtDuree(analyse.decalage)}</b> <small>(horloge du scanner + durée d'un scan)</small></div>
        <div class="liste compacte">${analyse.paires.sort((x, y) => (x.station.heure || 0) - (y.station.heure || 0)).map((p) => `<div class="ligne-liste"><div class="ll-txt"><b>${esc(p.station.nom)} ↔ ${esc(p.fichier.nom)}</b><small>par ${p.par === 'nom' ? 'le nom' : 'l\'heure'}${p.dt != null && p.par === 'heure' ? ` · écart ${fmtDuree(p.dt)} après correction` : ''}</small></div></div>`).join('')}</div>
        ${analyse.fichiersSeuls.length ? `<div class="carte-etat attente"><b>${analyse.fichiersSeuls.length} fichier(s) sans station</b> (scans jamais signalés) : ${analyse.fichiersSeuls.map((f) => esc(f.nom)).join(', ')}</div>` : ''}
        ${analyse.stationsSeules.length ? `<div class="carte-etat alerte"><b>${analyse.stationsSeules.length} station(s) sans fichier</b> (scan annulé ? bouton appuyé deux fois ?) : ${analyse.stationsSeules.map((s) => esc(s.nom)).join(', ')}</div>` : ''}
        <div class="actions-feuille"><button class="btn principal" data-a="appliquer">Appliquer</button></div>`;
      res.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (a === 'appliquer' && analyse) {
      const renommer = r.querySelector('[name=renommer]').checked;
      const creerManquants = r.querySelector('[name=creer]').checked;
      const toutes = () => D.liste('station', { tous: true });
      const base = (n) => n.replace(/\.[^.]+$/, '');
      for (const p of analyse.paires) {
        const s = p.station;
        s.fichier = p.fichier.nom;
        s.associe_par = p.par;
        if (renommer && p.par === 'heure') { s.nom = base(p.fichier.nom); s.numero = M.numeroDepuisNom(p.fichier.nom) ?? s.numero; }
        await D.enregistrer(s, { pasNotifier: true });
      }
      let crees = 0;
      if (creerManquants) {
        for (const f of analyse.fichiersSeuls) {
          const heure = f.t ? f.t - analyse.decalage : Date.now();
          const pos = f.t ? M.interpolerPosition(heure, toutes(), app.cal) : null;
          await D.enregistrer(D.nouveau('station', {
            numero: M.numeroDepuisNom(f.nom), nom: base(f.nom), scanner: scannerCourantSync(), heure, origine: 'fichier', fichier: f.nom, associe_par: 'fichier',
            ...(pos ? { x: pos.x, y: pos.y, src: 'interpole', entre: pos.entre } : { src: null }),
            note: 'Créé depuis la liste des fichiers du scanner.',
          }), { pasNotifier: true });
          crees++;
        }
      }
      D.signaler('station');
      toast(`${analyse.paires.length} association${analyse.paires.length > 1 ? 's' : ''} enregistrée${analyse.paires.length > 1 ? 's' : ''}${crees ? `, ${crees} scan(s) créé(s)` : ''}.`, { duree: 6000 });
      ouvrirListe('scans');
    }
  };
}

// =====================================================================
// Projets, opérateur, échange, réglages
// =====================================================================
function ouvrirPlus() {
  const p = etat.projet;
  const html = `
    <div class="tete-feuille"><h2>Plus</h2><button class="ico" data-a="fermer" aria-label="Fermer">${icone('fermer')}</button></div>
    <div class="menu">
      <h3>Projet</h3>
      <button data-a="projets">${icone('dossier')}<span>Projets<small>${p ? esc(p.nom) : 'aucun ouvert'}</small></span></button>
      ${p ? `<button data-a="plan">${icone('fichier')}<span>${p.planFichier ? 'Remplacer le plan' : 'Importer le plan'}<small>PDF, image ou capture satellite</small></span></button>
      <button data-a="reglages">${icone('reglages')}<span>Réglages du projet<small>numérotation des scans, scanners</small></span></button>` : ''}
      <h3>Équipe et données</h3>
      <button data-a="operateur">${icone('personne')}<span>Opérateur de ce téléphone<small>${esc(etat.operateur || '?')}</small></span></button>
      ${p ? `<button data-a="echanger">${icone('nuage')}<span>Échanger avec les autres téléphones<small>paquet hors ligne ou serveur</small></span></button>
      <button data-a="csv-scans">${icone('partager')}<span>Exporter les stations (CSV)<small>pour le recalage</small></span></button>
      <button data-a="csv-epingles">${icone('partager')}<span>Exporter les épingles (CSV)</span></button>` : `<button data-a="recevoir">${icone('recevoir')}<span>Recevoir un paquet</span></button>`}
      <h3>Application</h3>
      <button data-a="aide">${icone('info')}<span>Mode d'emploi rapide</span></button>
    </div>
    <p class="aide pied">POC interne LH Twin — données enregistrées sur ce téléphone${S.serveurConfigure() ? ' et sur le serveur de synchro' : ''}.</p>`;
  const r = ouvrirFeuille(html, { haute: true, cle: 'plus', onFermer: () => majBoutons() });
  r.onclick = (ev) => {
    const a = ev.target.closest('button')?.dataset.a;
    if (!a) return;
    ({
      fermer: fermerFeuille, projets: ouvrirProjets, plan: importerPlanUI, reglages: ouvrirReglages, operateur: () => choisirOperateur(false),
      echanger: ouvrirEchange, recevoir: recevoirPaquet, 'csv-scans': () => exporterCSV('scans'), 'csv-epingles': () => exporterCSV('epingles'), aide: ouvrirAide,
    })[a]?.();
  };
  majBoutons();
}

async function ouvrirProjets() {
  const projets = await D.listerProjets();
  const html = `
    <div class="tete-feuille"><h2>Projets</h2><button class="ico" data-a="fermer" aria-label="Fermer">${icone('fermer')}</button></div>
    <div class="liste">${projets.map((p) => `<button class="ligne-liste ${p.id === etat.projet?.id ? 'courant' : ''}" data-p="${p.id}">
      <span class="pastille" style="background:${p.exemple ? '#7C3AED' : '#0E6E5C'}">${icone('plan', 16)}</span>
      <div class="ll-txt"><b>${esc(p.nom)}</b><small>${p.exemple ? 'exemple · ' : ''}modifié ${fmtDateHeure(p.modifie_le)}${p.id === etat.projet?.id ? ' · ouvert' : ''}</small></div></button>`).join('') || '<p class="aide">Aucun projet sur ce téléphone.</p>'}</div>
    <div class="pile-boutons">
      <button class="btn principal" data-a="nouveau">${icone('dossier', 20)}<span>Nouveau projet</span></button>
      <button class="btn" data-a="exemple">${icone('plan', 20)}<span>Créer le projet d'exemple (poste fictif)</span></button>
      <button class="btn" data-a="recevoir">${icone('recevoir', 20)}<span>Recevoir un paquet d'un collègue</span></button></div>`;
  const r = ouvrirFeuille(html, { haute: true, cle: 'projets' });
  r.onclick = async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.p) { await D.ouvrirProjet(b.dataset.p); fermerFeuille(); return; }
    const a = b.dataset.a;
    if (a === 'fermer') fermerFeuille();
    else if (a === 'nouveau') nouveauProjet();
    else if (a === 'exemple') chargerExemple();
    else if (a === 'recevoir') recevoirPaquet();
  };
}

async function nouveauProjet() {
  const v = await demander({
    titre: 'Nouveau projet',
    champs: [
      { nom: 'nom', libelle: 'Nom du projet', placeholder: 'ex. Poste de … — relevé novembre' },
      { nom: 'scans', type: 'case', libelle: 'Suivre les stations de scan (bouton « Localiser ce scan »)', valeur: true },
    ],
    ok: 'Créer',
  });
  if (!v || !v.nom.trim()) return;
  await D.creerProjet(v.nom.trim(), { scans: v.scans });
  fermerFeuille();
  toast('Projet créé. Importez maintenant le plan.', { actions: [{ libelle: 'Importer', fn: importerPlanUI }] });
}

async function chargerExemple() {
  fermerFeuille();
  const t = toast('Création du projet d\'exemple…', { duree: 0 });
  try {
    await creerExemple();
    t.maj('Projet d\'exemple prêt : poste fictif, 2 opérateurs, 12 scans, avancement d\'hier et d\'aujourd\'hui. La position est simulée au portail.', { duree: 8000 });
  } catch (e) {
    console.error(e);
    t.maj('Échec : ' + esc(e.message), { duree: 8000 });
  }
}

async function importerPlanUI() {
  if (!verifierProjet()) return;
  const f = await choisirFichier('#in-plan');
  if (!f) return;
  if (etat.projet.planFichier && !(await confirmer('Remplacer le plan ? Les éléments pointés à la main resteront aux mêmes pixels et le calage sera à refaire.', 'Remplacer', true))) return;
  const t = toast('Import du plan…', { duree: 0 });
  try {
    const r = await I.importerPlan(f, (m) => t.maj(esc(m), { duree: 0 }));
    const id = await D.ajouterFichier(r.blob, { sorte: 'plan' });
    const p = etat.projet;
    Object.assign(p, { planFichier: id, planL: r.w, planH: r.h, planNom: f.name });
    await D.enregistrer(p);
    t.maj(`Plan importé (${r.w} × ${r.h} px${r.pages > 1 ? `, page 1 sur ${r.pages}` : ''}). Étape suivante : le calage GPS.`, { duree: 8000, actions: [{ libelle: 'Caler', fn: ouvrirCalage }] });
  } catch (e) {
    console.error(e);
    t.maj('Import impossible : ' + esc(e.message), { duree: 8000 });
  }
}

async function choisirOperateur(obligatoire) {
  const connus = await D.operateursConnus();
  const proposes = [...new Set([...connus, 'Eric', 'Tristan', 'Tom'])];
  return new Promise((resolve) => {
    const html = `<div class="tete-feuille"><div><h2>Qui utilise ce téléphone ?</h2><div class="meta">Chaque action sera signée de ce nom.</div></div>
      ${obligatoire ? '' : `<button class="ico" data-a="fermer" aria-label="Fermer">${icone('fermer')}</button>`}</div>
      <div class="pile-boutons">${proposes.map((n) => `<button class="btn ${n === etat.operateur ? 'principal' : ''}" data-nom="${esc(n)}"><span class="avatar-mini" style="background:${couleurNom(n)}">${initiales(n)}</span><span>${esc(n)}</span></button>`).join('')}</div>
      <form class="formulaire"><label class="champ"><span>Autre nom</span><input name="nom" placeholder="Prénom" autocomplete="off"></label>
      <div class="actions-feuille"><button class="btn principal" type="submit">Valider</button></div></form>`;
    const r = ouvrirFeuille(html, { modale: true, cle: 'operateur', onFermer: () => resolve() });
    const fixer = async (nom) => {
      if (!nom.trim()) return;
      await D.definirOperateur(nom);
      fermerFeuille();
      toast(`Bonjour ${esc(nom.trim())} : vos actions seront signées de votre nom.`);
    };
    r.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); fixer(r.querySelector('[name=nom]').value); });
    r.onclick = (ev) => {
      const b = ev.target.closest('button');
      if (b?.dataset.nom) fixer(b.dataset.nom);
      else if (b?.dataset.a === 'fermer') fermerFeuille();
    };
  });
}

function ouvrirEchange() {
  const st = S.statut;
  const html = `
    <div class="tete-feuille"><div><h2>Échanger les données</h2><div class="meta">Chaque élément garde son auteur : rien ne se mélange</div></div>
      <button class="ico" data-a="fermer" aria-label="Fermer">${icone('fermer')}</button></div>
    <h3>Sans réseau, de téléphone à téléphone</h3>
    <p class="aide">Envoyez un <b>paquet</b> (Quick Share, AirDrop, Bluetooth, WhatsApp, câble…). Le collègue l'ouvre avec « Recevoir ». On peut s'envoyer le paquet dans les deux sens, autant de fois qu'on veut : la fusion ne crée jamais de doublon.</p>
    <label class="case"><input type="checkbox" name="photos" checked> <span>Avec les photos (plus lourd)</span></label>
    <div class="ligne-boutons"><button class="btn principal" data-a="envoyer">${icone('partager', 18)}<span>Envoyer mes données</span></button>
      <button class="btn" data-a="recevoir">${icone('recevoir', 18)}<span>Recevoir un paquet</span></button></div>
    <h3>Avec réseau : serveur de synchronisation</h3>
    <div class="carte-etat ${st.etat === 'ok' ? 'ok' : st.etat === 'erreur' ? 'alerte' : 'attente'}">${S.serveurConfigure() ? `Serveur : <b>${esc(S.urlServeur() || location.host)}</b> · ${esc(st.message)}${st.dernier ? ` · dernière synchro ${fmtHeure(st.dernier)}` : ''}` : 'Aucun serveur réglé : tout reste sur ce téléphone jusqu\'au prochain échange.'} · ${st.attente || 0} élément(s) en attente d'envoi</div>
    <form class="formulaire" id="f-serveur">
      <label class="champ"><span>Adresse du serveur (vide = détection automatique)</span><input name="url" value="${esc(S.urlServeur() || '')}" placeholder="https://… (laisser vide si l'appli est servie par le serveur)" autocomplete="off"></label>
      <label class="champ"><span>Clé d'équipe (si le serveur en demande une)</span><input name="cle" value="${esc(S.cleServeur() || '')}" autocomplete="off"></label>
      <div class="actions-feuille"><button type="submit" class="btn">Enregistrer</button><button type="button" class="btn principal" data-a="sync">Synchroniser maintenant</button></div>
    </form>`;
  const r = ouvrirFeuille(html, { haute: true, cle: 'echange' });
  r.querySelector('#f-serveur').addEventListener('submit', async (e) => {
    e.preventDefault();
    await S.reglerServeur(r.querySelector('[name=url]').value, r.querySelector('[name=cle]').value);
    toast(S.serveurConfigure() ? 'Serveur enregistré.' : 'Aucun serveur trouvé à cette adresse.');
    ouvrirEchange();
  });
  r.onclick = async (ev) => {
    const a = ev.target.closest('button')?.dataset.a;
    if (a === 'fermer') fermerFeuille();
    else if (a === 'recevoir') recevoirPaquet();
    else if (a === 'sync') { await S.synchroniser(); ouvrirEchange(); }
    else if (a === 'envoyer') {
      const t = toast('Préparation du paquet…', { duree: 0 });
      try {
        const { blob, nbElements, nbFichiers } = await S.creerPaquet({ avecPhotos: r.querySelector('[name=photos]').checked });
        const nom = `releves-${nomFichierSur(etat.projet.nom)}-${nomFichierSur(etat.operateur)}-${jourISO()}-${new Date().getHours()}h${String(new Date().getMinutes()).padStart(2, '0')}.json`;
        t.maj(`Paquet prêt : ${nbElements} éléments, ${nbFichiers} fichiers (${fmtNb(blob.size / 1e6, 1)} Mo).`, { duree: 6000 });
        const res = await partagerOuTelecharger(blob, nom, 'Relevés de site', [[nom.replace(/\.json$/, '.txt'), 'text/plain']]);
        if (res === 'telecharge') toast('Paquet téléchargé : envoyez-le au collègue depuis vos fichiers.', { duree: 6000 });
      } catch (e) { t.maj('Échec : ' + esc(e.message), { duree: 7000 }); }
    }
  };
}

async function recevoirPaquet() {
  const f = await choisirFichier('#in-paquet');
  if (!f) return;
  const t = toast('Lecture du paquet…', { duree: 0 });
  try {
    const r = await S.importerPaquet(f);
    if (!etat.projet || etat.projet.id !== r.projet?.id) await D.ouvrirProjet(r.projet.id);
    const detail = Object.entries(r.parType).filter(([k]) => k !== 'projet').map(([k, n]) => `${n} ${{ epingle: 'épingle(s)', station: 'scan(s)', trait: 'trait(s) d\'avancement', calage: 'point(s) de calage' }[k] || k}`).join(', ');
    t.maj(`Paquet de <b>${esc(r.de || '?')}</b> reçu : ${r.nb ? detail || 'mises à jour' : 'rien de nouveau'}${r.nbFichiers ? `, ${r.nbFichiers} photo(s)/plan` : ''}.`, { duree: 8000 });
    fermerFeuille();
  } catch (e) {
    t.maj(esc(e.message), { duree: 7000 });
  }
}

function ouvrirReglages() {
  const p = etat.projet;
  const o = p.options || {};
  const prochain = M.prochainNumero(D.liste('station', { tous: true }), o, scannerCourantSync());
  const html = `
    <div class="tete-feuille"><h2>Réglages du projet</h2><button class="ico" data-a="fermer" aria-label="Fermer">${icone('fermer')}</button></div>
    <form class="formulaire">
      <label class="champ"><span>Nom du projet</span><input name="nom" value="${esc(p.nom)}"></label>
      <label class="case"><input type="checkbox" name="scans" ${o.scans !== false ? 'checked' : ''}> <span>Suivre les stations de scan</span></label>
      <div class="deux-col">
        <label class="champ"><span>Préfixe des scans</span><input name="prefixe" value="${esc(o.prefixe ?? 'Scan_')}"></label>
        <label class="champ"><span>Chiffres</span><input name="chiffres" type="number" min="1" max="6" value="${o.chiffres ?? 3}"></label>
      </div>
      <label class="champ"><span>Prochain numéro (caler sur le compteur du scanner)</span><input name="numeroDepart" type="number" min="1" value="${prochain}"></label>
      <label class="champ"><span>Scanners (séparés par des virgules)</span><input name="scanners" value="${esc((o.scanners || ['Scanner 1']).join(', '))}"></label>
      <label class="champ"><span>Scanner utilisé avec ce téléphone</span><select name="scanner">${(o.scanners || ['Scanner 1']).map((s) => `<option ${s === scannerCourantSync() ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <div class="actions-feuille"><button type="button" class="btn danger-txt" data-a="supprimer">Supprimer le projet</button><button type="submit" class="btn principal">Enregistrer</button></div>
    </form>`;
  const r = ouvrirFeuille(html, { haute: true, cle: 'reglages' });
  r.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const scanners = f.scanners.value.split(',').map((s) => s.trim()).filter(Boolean);
    p.nom = f.nom.value.trim() || p.nom;
    p.options = { ...o, scans: f.scans.checked, prefixe: f.prefixe.value, chiffres: Math.max(1, +f.chiffres.value || 3), numeroDepart: Math.max(1, +f.numeroDepart.value || 1), scanners: scanners.length ? scanners : ['Scanner 1'] };
    scannerCourantCache = f.scanner.value;
    await D.ecrireMeta('scanner:' + p.id, scannerCourantCache);
    await D.enregistrer(p);
    fermerFeuille();
    toast('Réglages enregistrés.');
  });
  r.onclick = async (ev) => {
    const a = ev.target.closest('button')?.dataset.a;
    if (a === 'fermer') fermerFeuille();
    else if (a === 'supprimer') {
      if (await confirmer(`Supprimer le projet « ${p.nom} » ? (pour tous les téléphones, à la prochaine synchro)`, 'Supprimer', true)) {
        await D.supprimerElement(p);
        await D.ouvrirProjet(null);
        fermerFeuille();
      } else ouvrirReglages();
    }
  };
}

function ouvrirAide() {
  ouvrirFeuille(`
    <div class="tete-feuille"><h2>Mode d'emploi rapide</h2><button class="ico" data-a="fermer" aria-label="Fermer">${icone('fermer')}</button></div>
    <div class="aide-texte">
      <p><b>Plan</b> : un doigt déplace, deux doigts zooment, double-tape pour zoomer. Appui long : créer une épingle, un scan oublié, un point de calage.</p>
      <p><b>Calage</b> (onglet Calage) : sur un point reconnaissable, « Je suis ici » puis visez-le sur le plan. Deux points éloignés suffisent, trois pour contrôler. Ensuite, photos et scans se placent seuls.</p>
      <p><b>Photo</b> (bouton appareil) : la photo est placée par GPS ; près d'une épingle existante, l'appli propose de l'y ajouter (ex. plaque signalétique d'un équipement). Renseignez repère et travée.</p>
      <p><b>Localiser ce scan</b> : un appui à chaque station. Numéro automatique, heure, GPS. Oubli ? Appui long sur le plan › « Scan oublié ». Le soir : Liste › Scans › « Associer les fichiers du scanner », puis export CSV pour le recalage.</p>
      <p><b>Avancement</b> : le matin, peignez en jaune les zones du jour ; repassez en vert ce qui est fait. « Tout » montre l'ensemble ; le bleu délimite le périmètre total.</p>
      <p><b>Équipe</b> : chaque action est signée. Filtre par personne en haut. Échange hors ligne par paquet (Plus › Échanger), ou synchro automatique si un serveur est joignable.</p>
    </div>`, { haute: true, cle: 'aide' });
  $('#feuille-contenu [data-a=fermer]').onclick = fermerFeuille;
}

// =====================================================================
// Boutons de l'écran principal
// =====================================================================
function brancherBoutons() {
  document.addEventListener('feuille', () => majBoutons());
  $('#b-photo').addEventListener('click', photoRapide);
  $('#b-scan').addEventListener('click', localiserScan);
  $('#b-gps').addEventListener('click', basculerGPS);
  $('#b-epingle').addEventListener('click', () => {
    if (!verifierProjet() || !app.img) return;
    placer({ message: 'Placez le viseur sur l\'emplacement de l\'épingle, puis validez.', valider: (p) => creerEpingleA(p) });
  });
  $('#b-menu').addEventListener('click', ouvrirPlus);
  $('#b-projet').addEventListener('click', ouvrirProjets);
  $('#b-operateur').addEventListener('click', () => choisirOperateur(false));
  $('#b-sync').addEventListener('click', () => (etat.projet ? ouvrirEchange() : null));
  $('#voile').addEventListener('click', () => { if (!feuilleOuverte('operateur') || etat.operateur) fermerFeuille(); });
  $('#vide').addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'exemple') chargerExemple();
    else if (a === 'nouveau') nouveauProjet();
    else if (a === 'recevoir') recevoirPaquet();
    else if (a === 'plan') importerPlanUI();
  });
  $('#filtres').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.couche) { app.couches[b.dataset.couche] = !app.couches[b.dataset.couche]; majFiltres(); app.vue.rendre(); return; }
    if (b.dataset.filtre === undefined) return;
    const nom = b.dataset.filtre;
    if (!nom) D.definirFiltre(null);
    else {
      const s = new Set(etat.filtre || []);
      s.has(nom) ? s.delete(nom) : s.add(nom);
      D.definirFiltre(s);
    }
  });
  $$('.onglets button').forEach((b) => b.addEventListener('click', () => {
    const o = b.dataset.onglet;
    if (app.mode === 'placement') return;
    if (app.mode === 'peinture' && o !== 'avancement') finMode();
    if (o === 'plan') { fermerFeuille(); if (app.mode !== 'plan') finMode(); app.vue.rendre(); }
    else if (o === 'liste') (feuilleOuverte('liste') ? fermerFeuille() : ouvrirListe());
    else if (o === 'avancement') (app.mode === 'peinture' ? finMode() : entrerPeinture());
    else if (o === 'calage') (feuilleOuverte('calage') ? fermerFeuille() : ouvrirCalage());
    else if (o === 'plus') (feuilleOuverte('plus') ? fermerFeuille() : ouvrirPlus());
    majBoutons();
  }));
  D.lireMeta('scanner:' + (etat.projet?.id || '')).then((s) => { scannerCourantCache = s; });
  D.surChangement(async (q) => { if (q === 'projet' && etat.projet) scannerCourantCache = await D.lireMeta('scanner:' + etat.projet.id); });
}

demarrer().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<div class="erreur-fatale">Erreur au démarrage : ${esc(e.message)}</div>`);
});
