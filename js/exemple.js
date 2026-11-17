// Projets d'exemple, recréés à la demande. Les heures partent d'aujourd'hui pour que la démonstration soit « du jour ».
//  - « claix » : les abords réels du siège, 4 allée de l'Atrium à Claix (photo aérienne IGN + BD TOPO, 200 m × 200 m).
//    Le plan est géoréférencé exactement : sur place, le vrai GPS du téléphone fonctionne.
//  - « poste » : un poste électrique 63/20 kV FICTIF (plan dessiné, lieu inventé), position simulée.
import { etat, nouveau, enregistrerLot, ajouterFichier, ouvrirProjet } from './donnees.js';
import { depuisLocal } from './geo.js';
import { importerPlan, photoExemple } from './images.js';
import { jourISO, decalerJour, uid } from './outils.js';

// ---------- Géoréférencement des deux plans ----------
// Claix : emprise Web Mercator (EPSG:3857) de l'image, nord en haut, 2 400 px
const R = 6378137;
const CLAIX = { xmin: 633382.179, ymin: 5640270.628, xmax: 633665.616, ymax: 5640554.064, w: 2400 };
function gpsClaix(x, y) {
  const X = CLAIX.xmin + (x / CLAIX.w) * (CLAIX.xmax - CLAIX.xmin);
  const Y = CLAIX.ymax - (y / CLAIX.w) * (CLAIX.ymax - CLAIX.ymin);
  return { lat: (2 * Math.atan(Math.exp(Y / R)) - Math.PI / 2) * (180 / Math.PI), lon: (X / R) * (180 / Math.PI) };
}
// Poste fictif : centre du dessin (1500, 1000) px, 5 cm/px, nord à 20° à droite du haut de la feuille
const POSTE = { lat0: 14.6094, lon0: -60.9932, ech: 0.05, rot: (20 * Math.PI) / 180 };
function gpsPoste(x, y) {
  const u = (x - 1500) * POSTE.ech, v = -(y - 1000) * POSTE.ech;
  return depuisLocal(u * Math.cos(POSTE.rot) - v * Math.sin(POSTE.rot), u * Math.sin(POSTE.rot) + v * Math.cos(POSTE.rot), POSTE.lat0, POSTE.lon0);
}
function bruiter(g, metres) {
  if (!metres) return g;
  const a = Math.random() * 2 * Math.PI, r = Math.random() * metres;
  return { lat: g.lat + (r * Math.sin(a)) / 111320, lon: g.lon + (r * Math.cos(a)) / (111320 * Math.cos((g.lat * Math.PI) / 180)) };
}

// Coordonnées des modèles exprimées dans le repère de leur fichier source (largeur « ref »)
const MODELES = {
  claix: {
    nom: 'Siège LH Twin, Claix — exemple',
    fichier: 'exemple/plan-claix.jpg', type: 'image/jpeg', ref: 2400,
    gps: gpsClaix,
    simulation: false,
    depart: [1200, 1200],                // l'adresse
    prefixeFichiers: 'Atrium_',
    calage: [
      ['Angle bât. carré', 490, 820, 4, 7, 52, 'Eric'],
      ['Passage piéton', 2190, 1090, 4, 7, 58, 'Eric'],
      ['Entrée parking', 1700, 2160, 5, 8, 4, 'Tristan'],
    ],
    photos: {
      compteur: ['COMPTEUR ÉLECTRIQUE', ['Tarif jaune — 36 à 250 kVA', 'Tension 400 V triphasé', 'N° PRM 00000000000000'], '#a7aeb5'],
      coffret: ['COFFRET DE COUPURE', ['Repère CC-01', 'Coupure générale bâtiment', 'Ne pas obstruer'], '#c9b458'],
      rue: ['ALLÉE DU LAC BLANC', ['Commune de Claix'], '#3f6fb5'],
    },
    epingles: [
      ['Eric', 8, 2, 1200, 1200, { categorie: 'acces', titre: 'Entrée du siège', travee: 'Bât. A', commentaire: 'Badge à l\'accueil. Prévenir avant de scanner le hall.', src: 'pointe' }],
      ['Eric', 9, 20, 1500, 1260, { categorie: 'equipement', titre: 'Coffret de coupure CC-01', travee: 'Bât. A', commentaire: 'Façade est, derrière la haie.', src: 'pointe' }],
      ['Eric', 9, 22, 1540, 1300, { categorie: 'plaque', titre: 'Plaque du coffret CC-01', travee: 'Bât. A', photo: 'coffret', acc: 4 }],
      ['Tristan', 10, 8, 1620, 1330, { categorie: 'plaque', titre: 'Compteur électrique', travee: 'Bât. A', photo: 'compteur', acc: 6, statut: 'traite' }],
      ['Tristan', 10, 40, 1490, 1550, { categorie: 'plaque', titre: 'Plaque de rue', travee: 'Voirie', photo: 'rue', acc: 5, statut: 'traite' }],
      ['Eric', 8, 10, 1040, 760, { categorie: 'remarque', titre: 'Parking visiteurs', travee: 'Voirie', commentaire: 'Places libres le matin le long de l\'allée de l\'Atrium.', src: 'pointe' }],
      ['Eric', 11, 5, 2190, 1090, { categorie: 'acces', titre: 'Traversée avenue de la Ridelet', travee: 'Voirie', commentaire: 'Circulation : gilet obligatoire pour les stations côté avenue.', src: 'pointe' }],
      ['Tristan', 11, 15, 1960, 1150, { categorie: 'equipement', titre: 'Poteau incendie', travee: 'Voirie', commentaire: 'À confirmer sur place.', acc: 7 }],
    ],
    sansPosition: ['Tristan', 11, 30, { categorie: 'photo', titre: 'Façade arrière', commentaire: 'Photo prise sans GPS.' }],
    stations: [
      ['Eric', 1, 8, 12, 1080, 940, { acc: 4 }],
      ['Eric', 2, 8, 24, 1300, 1040, { acc: 5 }],
      ['Eric', 3, 8, 37, 1400, 1120, { acc: 6 }],
      ['Eric', 4, 8, 49, 860, 1120, { acc: 4 }],
      ['Eric', 5, 9, 2, 450, 1120, { acc: 18 }],
      ['Eric', 6, 9, 15, 1200, 1600, { acc: 35, note: 'GPS mauvais sous les arbres.' }],
      ['Eric', 7, 9, 27, null, null, { note: 'Bouton appuyé, pas de GPS.' }],
      ['Eric', 8, 9, 40, 1400, 1580, { src: 'pointe', tardif: true, origine: 'tardif', note: 'Oublié — pointé sur le plan à 10 h.' }],
      ['Tristan', 9, 10, 5, 1680, 1580, { acc: 5 }],
      ['Tristan', 10, 10, 18, 2080, 1400, { acc: 4 }],
      ['Tristan', 11, 10, 31, 2080, 1200, { acc: 5 }],
      ['Tristan', 12, 10, 44, 1920, 1120, { acc: 7 }],
    ],
    traits: [
      ['Eric', 7, 30, -1, 'perimetre', 500, 700, 2100, 1700, 200],
      ['Eric', 7, 31, -1, 'prevu', 950, 820, 1800, 1050, 120],
      ['Eric', 16, 30, -1, 'fait', 950, 820, 1800, 1050, 120],
      ['Tristan', 7, 45, 0, 'prevu', 1250, 1000, 1850, 1450, 120],
      ['Tristan', 7, 46, 0, 'prevu', 1000, 1480, 1800, 1650, 120],
      ['Eric', 10, 0, 0, 'fait', 1250, 1000, 1600, 1300, 120],
      ['Tristan', 11, 0, 0, 'fait', 1000, 1480, 1350, 1650, 120],
    ],
  },

  poste: {
    nom: 'Poste 63/20 kV — exemple fictif',
    fichier: 'exemple/plan-poste-exemple.svg', type: 'image/svg+xml', ref: 3000,
    gps: gpsPoste,
    simulation: true,
    depart: [1450, 1700],                // le portail
    prefixeFichiers: 'Poste063_',
    calage: [
      ['Portail', 1450, 1750, 4, 7, 52, 'Eric'], ['Angle bâtiment', 820, 1150, 5, 7, 58, 'Eric'], ['Angle clôture NE', 2800, 150, 4, 8, 4, 'Tristan'],
    ],
    photos: {
      tr1: ['TRANSFORMATEUR TRIPHASÉ', ['63 000 / 20 000 V', 'Puissance 36 MVA', 'Couplage YNd11', 'N° série 000000'], '#9aa3ab'],
      dj: ['DISJONCTEUR 72,5 kV', ['In 3150 A — Icc 31,5 kA', 'Commande ressort', 'Année 2004', 'Repère 52-T1'], '#a7aeb5'],
      tt: ['TRANSFO. DE TENSION', ['63 000:√3 / 100:√3 V', 'Classe 0,5 — 3P', 'Repère TT-T2'], '#a3a99f'],
    },
    epingles: [
      ['Eric', 9, 20, 2050, 1180, { categorie: 'equipement', titre: 'TR1 63/20 kV', travee: 'T4', commentaire: 'Bac de rétention plein d\'eau côté est.', src: 'pointe' }],
      ['Eric', 9, 22, 2175, 1200, { categorie: 'plaque', titre: 'Plaque TR1', travee: 'T4', photo: 'tr1', acc: 4, commentaire: 'Plaque côté nord, lisible.' }],
      ['Tristan', 10, 8, 1150, 525, { categorie: 'equipement', titre: 'Disjoncteur 52-T1', travee: 'T1', src: 'pointe', statut: 'traite' }],
      ['Tristan', 10, 10, 1195, 545, { categorie: 'plaque', titre: 'Plaque disjoncteur T1', travee: 'T1', photo: 'dj', acc: 6 }],
      ['Tristan', 10, 40, 1450, 395, { categorie: 'plaque', titre: 'Plaque TT ligne B', travee: 'T2', photo: 'tt', acc: 5, statut: 'traite' }],
      ['Eric', 8, 2, 1450, 1690, { categorie: 'acces', titre: 'Portail', commentaire: 'Badge à récupérer au bâtiment de commande. Chargé de consignation présent jusqu\'à 16 h.', src: 'pointe' }],
      ['Eric', 11, 5, 430, 1330, { categorie: 'remarque', titre: 'Salle 20 kV', commentaire: 'Fermée à clé — repasser à 14 h.', src: 'pointe' }],
    ],
    sansPosition: ['Tristan', 11, 30, { categorie: 'photo', titre: 'Caniveau câbles', commentaire: 'Photo prise sans GPS.' }],
    stations: [
      ['Eric', 1, 8, 12, 1300, 1650, { acc: 4 }],
      ['Eric', 2, 8, 24, 1300, 1300, { acc: 5 }],
      ['Eric', 3, 8, 37, 1000, 900, { acc: 6 }],
      ['Eric', 4, 8, 49, 1300, 820, { acc: 4 }],
      ['Eric', 5, 9, 2, 1600, 820, { acc: 18 }],
      ['Eric', 6, 9, 15, 1300, 450, { acc: 35, note: 'GPS mauvais sous le portique.' }],
      ['Eric', 7, 9, 27, null, null, { note: 'Bouton appuyé, pas de GPS.' }],
      ['Eric', 8, 9, 40, 1600, 450, { src: 'pointe', tardif: true, origine: 'tardif', note: 'Oublié — pointé sur le plan à 10 h.' }],
      ['Tristan', 9, 10, 5, 1900, 820, { acc: 5 }],
      ['Tristan', 10, 10, 18, 2200, 820, { acc: 4 }],
      ['Tristan', 11, 10, 31, 2200, 1150, { acc: 5 }],
      ['Tristan', 12, 10, 44, 1900, 1150, { acc: 7 }],
    ],
    traits: [
      ['Eric', 7, 30, -1, 'perimetre', 200, 150, 2800, 1750, 260],
      ['Eric', 7, 31, -1, 'prevu', 280, 1080, 840, 1600, 150],
      ['Eric', 16, 30, -1, 'fait', 280, 1080, 840, 1600, 150],
      ['Tristan', 7, 45, 0, 'prevu', 1000, 200, 2200, 860, 150],
      ['Tristan', 7, 46, 0, 'prevu', 1900, 860, 2200, 1400, 150],
      ['Eric', 10, 0, 0, 'fait', 1000, 200, 1600, 860, 150],
      ['Tristan', 11, 0, 0, 'fait', 1600, 200, 1900, 600, 150],
    ],
  },
};

const modeleDe = (p) => MODELES[p?.exemple === true ? 'poste' : p?.exemple] || null;

// Position de départ de la simulation, en GPS
export function positionDepart(p) {
  const m = modeleDe(p);
  return m ? m.gps(...m.depart) : null;
}
// Le poste fictif n'existe pas : sa position est toujours simulée. À Claix, le vrai GPS sert.
export const simulationParDefaut = (p) => !!modeleDe(p)?.simulation;

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

export async function creerExemple(cle = 'claix') {
  const M = MODELES[cle];
  const brut = await (await fetch(M.fichier)).blob();
  const plan = await importerPlan(new File([brut], M.fichier.split('/').pop(), { type: M.type }));
  const k = plan.w / M.ref; // pixels de l'image importée par pixel du fichier source

  const projet = nouveau('projet', {
    nom: M.nom,
    options: { scans: true, prefixe: 'Scan_', chiffres: 3, numeroDepart: 1, scanners: ['Scanner 1'] },
    planL: plan.w, planH: plan.h, planNom: M.fichier.split('/').pop(), exemple: cle,
  });
  projet.projet = projet.id;
  const ancien = etat.projet;
  etat.projet = projet;
  projet.planFichier = await ajouterFichier(plan.blob, { projet: projet.id, sorte: 'plan' });

  const auj = jourISO();
  const [y, m, d] = auj.split('-').map(Number);
  const a = (h, mi, decalJour = 0) => new Date(y, m - 1, d + decalJour, h, mi).getTime();
  const els = [projet];
  const el = (type, auteur, t, champs) => {
    const e = { id: uid(), type, projet: projet.id, auteur, cree_le: t, modifie_le: t, modifie_par: auteur, appareil: 'exemple', ...champs };
    els.push(e);
    return e;
  };
  const P = (x, yy) => ({ x: x * k, y: yy * k });

  for (const [nom, x, yy, acc, h, mi, qui] of M.calage) {
    const g = bruiter(M.gps(x, yy), 1.5);
    el('calage', qui, a(h, mi), { ...P(x, yy), lat: g.lat, lon: g.lon, acc, nom, actif: true, source: 'gps' });
  }

  const photos = {};
  for (const [cleP, [titre, lignes, teinte]] of Object.entries(M.photos)) {
    photos[cleP] = await ajouterFichier(await photoExemple(titre, lignes, teinte), { projet: projet.id });
  }

  for (const [qui, h, mi, x, yy, champs] of M.epingles) {
    const { photo, acc, ...reste } = champs;
    const g = bruiter(M.gps(x, yy), (acc || 5) * 0.6);
    el('epingle', qui, a(h, mi), {
      ...P(x, yy), src: 'gps', gps: { lat: g.lat, lon: g.lon, acc: acc || 5 }, statut: 'ouvert',
      photos: photo ? [photos[photo]] : [], ...reste,
    });
  }
  const [quiS, hS, miS, champsS] = M.sansPosition;
  el('epingle', quiS, a(hS, miS), { statut: 'ouvert', photos: [], src: null, ...champsS });

  for (const [qui, num, h, mi, x, yy, champs] of M.stations) {
    const t = a(h, mi);
    const base = { numero: num, nom: 'Scan_' + String(num).padStart(3, '0'), scanner: 'Scanner 1', heure: t, origine: 'bouton', ...champs };
    if (x != null && champs.src !== 'pointe') {
      const acc = champs.acc || 5;
      const g = bruiter(M.gps(x, yy), acc * 0.6);
      Object.assign(base, { src: 'gps', gps: { lat: g.lat, lon: g.lon, acc } });
    } else if (x != null) Object.assign(base, P(x, yy));
    delete base.acc;
    el('station', qui, t + 20000, base);
  }

  for (const [qui, h, mi, decal, etatP, x0, y0, x1, y1, larg] of M.traits) {
    el('trait', qui, a(h, mi, decal), {
      etat: etatP, jour: decal ? decalerJour(auj, decal) : auj, largeur: larg * k,
      pts: zigzag(x0, y0, x1, y1, larg).map((v) => Math.round(v * k * 10) / 10),
    });
  }

  await enregistrerLot(els);
  etat.projet = ancien;
  await ouvrirProjet(projet.id);
  return projet;
}

// Liste de fichiers « comme sortie du scanner » pour essayer l'association après coup.
// Cas peu rigoureux volontaires : le scanner nomme ses fichiers autrement que l'application,
// son horloge avance de 2 min 10 s, l'heure du fichier est celle de fin de scan
// (≈ 7 min après l'appui sur le bouton), et un scan n'a jamais été signalé (le 13e).
export function listeFichiersExemple(p = etat.projet) {
  const prefixe = modeleDe(p)?.prefixeFichiers || 'Scan_';
  const [y, m, d] = jourISO().split('-').map(Number);
  const heures = [[8, 19], [8, 31], [8, 44], [8, 56], [9, 9], [9, 22], [9, 34], [9, 47], [10, 12], [10, 25], [10, 38], [10, 51], [11, 3]];
  const deux = (n) => String(n).padStart(2, '0');
  return heures.map(([h, mi], i) => {
    const t = new Date(y, m - 1, d, h, mi + 2, 10);
    return `${prefixe}${String(i + 1).padStart(3, '0')}.fls ${deux(d)}/${deux(m)}/${y} ${deux(t.getHours())}:${deux(t.getMinutes())}:${deux(t.getSeconds())}`;
  }).join('\n');
}

// Pour le banc de test : modèle du poste fictif
export const gpsDuPlan = gpsPoste;
