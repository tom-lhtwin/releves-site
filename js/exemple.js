// Projet d'exemple : poste 63/20 kV FICTIF, plan dessiné, calage, épingles, stations et avancement.
// Les heures sont recalculées à partir d'aujourd'hui pour que la démonstration paraisse « du jour ».
import { etat, nouveau, enregistrerLot, ajouterFichier, ouvrirProjet } from './donnees.js';
import { depuisLocal, versLocal } from './geo.js';
import { importerPlan, photoExemple } from './images.js';
import { jourISO, decalerJour, uid } from './outils.js';

// Modèle du lieu fictif : centre du plan (1500, 1000) px, 5 cm/px, nord à 20° à droite du haut de la feuille
const LAT0 = 14.6094, LON0 = -60.9932, ECH = 0.05, ROT = (20 * Math.PI) / 180;
export function gpsDuPlan(x, y, bruitM = 0) {
  const u = (x - 1500) * ECH, v = -(y - 1000) * ECH;
  let X = u * Math.cos(ROT) - v * Math.sin(ROT), Y = u * Math.sin(ROT) + v * Math.cos(ROT);
  if (bruitM) { const a = Math.random() * 2 * Math.PI, r = Math.random() * bruitM; X += r * Math.cos(a); Y += r * Math.sin(a); }
  return depuisLocal(X, Y, LAT0, LON0);
}
export const centreExemple = () => ({ lat: LAT0, lon: LON0 });

function zigzag(x0, y0, x1, y1, larg) {
  const pts = [];
  const pas = larg * 0.75;
  let sens = 0;
  for (let y = y0 + larg / 2; y <= y1 - larg / 2 + pas * 0.5; y += pas) {
    const yy = Math.min(y, y1 - larg / 2);
    if (sens) pts.push(x1 - larg / 2, yy, x0 + larg / 2, yy); else pts.push(x0 + larg / 2, yy, x1 - larg / 2, yy);
    sens = 1 - sens;
  }
  return pts;
}

export async function creerExemple() {
  const svg = await (await fetch('exemple/plan-poste-exemple.svg')).blob();
  const plan = await importerPlan(new File([svg], 'plan-poste-exemple.svg', { type: 'image/svg+xml' }));
  const k = plan.w / 3000; // le plan est rastérisé à 4096 px de large : coordonnées SVG × k

  const projet = nouveau('projet', {
    nom: 'Poste 63/20 kV — exemple fictif',
    options: { scans: true, prefixe: 'Scan_', chiffres: 3, numeroDepart: 1, scanners: ['Scanner 1'] },
    planL: plan.w, planH: plan.h, planNom: 'plan-poste-exemple.svg', exemple: true,
  });
  projet.projet = projet.id;
  const ancien = etat.projet;
  etat.projet = projet; // pour que les fichiers et éléments soient rattachés au nouveau projet
  projet.planFichier = await ajouterFichier(plan.blob, { projet: projet.id, sorte: 'plan' });

  const auj = jourISO();
  const hier = decalerJour(auj, -1);
  const [y, m, d] = auj.split('-').map(Number);
  const a = (h, mi) => new Date(y, m - 1, d, h, mi).getTime();
  const els = [projet];
  const el = (type, auteur, t, champs) => {
    const e = { id: uid(), type, projet: projet.id, auteur, cree_le: t, modifie_le: t, modifie_par: auteur, appareil: 'exemple', ...champs };
    els.push(e);
    return e;
  };
  const P = (x, y2) => ({ x: x * k, y: y2 * k });

  // Points de calage (« je suis ici » au portail, à l'angle du bâtiment, à l'angle de clôture)
  for (const [nom, x, yy, acc, h, mi, qui] of [
    ['Portail', 1450, 1750, 4, 7, 52, 'Eric'], ['Angle bâtiment', 820, 1150, 5, 7, 58, 'Eric'], ['Angle clôture NE', 2800, 150, 4, 8, 4, 'Tristan'],
  ]) {
    const g = gpsDuPlan(x, yy, 2);
    el('calage', qui, a(h, mi), { ...P(x, yy), lat: g.lat, lon: g.lon, acc, nom, actif: true, source: 'gps' });
  }

  // Photos d'illustration
  const ph = async (titre, lignes, teinte) => ajouterFichier(await photoExemple(titre, lignes, teinte), { projet: projet.id });
  const pTR1 = await ph('TRANSFORMATEUR TRIPHASÉ', ['63 000 / 20 000 V', 'Puissance 36 MVA', 'Couplage YNd11', 'N° série 000000'], '#9aa3ab');
  const pDJ = await ph('DISJONCTEUR 72,5 kV', ['In 3150 A — Icc 31,5 kA', 'Commande ressort', 'Année 2004', 'Repère 52-T1'], '#a7aeb5');
  const pTT = await ph('TRANSFO. DE TENSION', ['63 000:√3 / 100:√3 V', 'Classe 0,5 — 3P', 'Repère TT-T2'], '#a3a99f');

  // Épingles
  const ep = (qui, h, mi, x, yy, champs) => {
    const t = a(h, mi);
    const g = gpsDuPlan(x, yy, 3);
    return el('epingle', qui, t, { ...P(x, yy), src: champs.src || 'gps', gps: { lat: g.lat, lon: g.lon, acc: champs.acc || 5 }, statut: 'ouvert', photos: [], ...champs });
  };
  ep('Eric', 9, 20, 2050, 1180, { categorie: 'equipement', titre: 'TR1 63/20 kV', travee: 'T4', commentaire: 'Bac de rétention plein d\'eau côté est.', src: 'pointe' });
  ep('Eric', 9, 22, 2175, 1200, { categorie: 'plaque', titre: 'Plaque TR1', travee: 'T4', photos: [pTR1], acc: 4, commentaire: 'Plaque côté nord, lisible.' });
  ep('Tristan', 10, 8, 1150, 525, { categorie: 'equipement', titre: 'Disjoncteur 52-T1', travee: 'T1', src: 'pointe', statut: 'traite' });
  ep('Tristan', 10, 10, 1195, 545, { categorie: 'plaque', titre: 'Plaque disjoncteur T1', travee: 'T1', photos: [pDJ], acc: 6 });
  ep('Tristan', 10, 40, 1450, 395, { categorie: 'plaque', titre: 'Plaque TT ligne B', travee: 'T2', photos: [pTT], acc: 5, statut: 'traite' });
  ep('Eric', 8, 2, 1450, 1690, { categorie: 'acces', titre: 'Portail', commentaire: 'Badge à récupérer au bâtiment de commande. Chargé de consignation présent jusqu\'à 16 h.', src: 'pointe' });
  ep('Eric', 11, 5, 430, 1330, { categorie: 'remarque', titre: 'Salle 20 kV', commentaire: 'Fermée à clé — repasser à 14 h.', src: 'pointe' });
  // Une photo prise sans position : elle attend d'être placée
  el('epingle', 'Tristan', a(11, 30), { categorie: 'photo', titre: 'Caniveau câbles', commentaire: 'Photo prise sans GPS.', photos: [], statut: 'ouvert', src: null });

  // Stations de scan (dont quelques cas « peu rigoureux »)
  const st = (qui, num, h, mi, x, yy, champs = {}) => {
    const t = a(h, mi);
    const base = { numero: num, nom: 'Scan_' + String(num).padStart(3, '0'), scanner: 'Scanner 1', heure: t, origine: 'bouton', ...champs };
    if (x != null && champs.src !== 'pointe') {
      const acc = champs.acc || 5;
      const g = gpsDuPlan(x, yy, acc * 0.6);
      Object.assign(base, { src: 'gps', gps: { lat: g.lat, lon: g.lon, acc } });
    } else if (x != null) Object.assign(base, P(x, yy));
    delete base.acc;
    return el('station', qui, t + 20000, base);
  };
  st('Eric', 1, 8, 12, 1300, 1650, { acc: 4 });
  st('Eric', 2, 8, 24, 1300, 1300, { acc: 5 });
  st('Eric', 3, 8, 37, 1000, 900, { acc: 6 });
  st('Eric', 4, 8, 49, 1300, 820, { acc: 4 });
  st('Eric', 5, 9, 2, 1600, 820, { acc: 18 });
  st('Eric', 6, 9, 15, 1300, 450, { acc: 35, note: 'GPS mauvais sous le portique.' });
  st('Eric', 7, 9, 27, null, null, { note: 'Bouton appuyé, pas de GPS.' });
  st('Eric', 8, 9, 40, 1600, 450, { src: 'pointe', tardif: true, origine: 'tardif', note: 'Oublié — pointé sur le plan à 10 h.' });
  st('Tristan', 9, 10, 5, 1900, 820, { acc: 5 });
  st('Tristan', 10, 10, 18, 2200, 820, { acc: 4 });
  st('Tristan', 11, 10, 31, 2200, 1150, { acc: 5 });
  st('Tristan', 12, 10, 44, 1900, 1150, { acc: 7 });

  // Avancement : hier le bâtiment, aujourd'hui les travées T1 à T4 ; périmètre = plateforme clôturée
  const tr = (qui, h, mi, jour, etatP, x0, y0, x1, y1, larg = 150) =>
    el('trait', qui, a(h, mi) - (jour === hier ? 86400e3 : 0), { etat: etatP, jour, largeur: larg * k, pts: zigzag(x0, y0, x1, y1, larg).map((v) => Math.round(v * k * 10) / 10) });
  tr('Eric', 7, 30, hier, 'perimetre', 200, 150, 2800, 1750, 260);
  tr('Eric', 7, 31, hier, 'prevu', 280, 1080, 840, 1600);
  tr('Eric', 16, 30, hier, 'fait', 280, 1080, 840, 1600);
  tr('Tristan', 7, 45, auj, 'prevu', 1000, 200, 2200, 860);
  tr('Tristan', 7, 46, auj, 'prevu', 1900, 860, 2200, 1400);
  tr('Eric', 10, 0, auj, 'fait', 1000, 200, 1600, 860);
  tr('Tristan', 11, 0, auj, 'fait', 1600, 200, 1900, 600);

  await enregistrerLot(els);
  etat.projet = ancien;
  await ouvrirProjet(projet.id);
  return projet;
}

// Liste de fichiers « comme sortie du scanner » pour essayer l'association après coup.
// Cas peu rigoureux volontaires : le scanner nomme ses fichiers autrement que l'application
// (Poste063_…), son horloge avance de 2 min 10 s, l'heure du fichier est celle de fin de scan
// (≈ 7 min après l'appui sur le bouton), et un scan n'a jamais été signalé (le 13e).
export function listeFichiersExemple() {
  const [y, m, d] = jourISO().split('-').map(Number);
  const heures = [[8, 19], [8, 31], [8, 44], [8, 56], [9, 9], [9, 22], [9, 34], [9, 47], [10, 12], [10, 25], [10, 38], [10, 51], [11, 3]];
  const deux = (n) => String(n).padStart(2, '0');
  return heures.map(([h, mi], i) => {
    const t = new Date(y, m - 1, d, h, mi + 2, 10);
    return `Poste063_${String(i + 1).padStart(3, '0')}.fls ${deux(d)}/${deux(m)}/${y} ${deux(t.getHours())}:${deux(t.getMinutes())}:${deux(t.getSeconds())}`;
  }).join('\n');
}

export function estExemple() { return !!etat.projet?.exemple; }
export { versLocal };
