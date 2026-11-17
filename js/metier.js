// Règles métier : positions, confiance des stations, numérotation des scans,
// association après coup avec la liste des fichiers du scanner, exports CSV.
import { gpsVersPlan, planVersGps, planVersLocal, versUTM } from './geo.js';
import { csv, jourISO, fmtHeure } from './outils.js';
import { CATEGORIES } from './config.js';

// Position sur le plan : recalculée depuis le GPS si l'élément a été placé par GPS
// (un meilleur calage déplace donc tout seul les éléments concernés).
export function positionPlan(r, cal) {
  if (r.src === 'gps' && r.gps && cal?.ok) return gpsVersPlan(cal, r.gps.lat, r.gps.lon);
  if (Number.isFinite(r.x) && Number.isFinite(r.y)) return { x: r.x, y: r.y };
  return null;
}

export function incertitudeM(r, cal) {
  if (r.src === 'gps' && r.gps) return (r.gps.acc || 10) + (cal?.ok ? cal.emq ?? 3 : 0);
  if (r.src === 'interpole') return r.incertitude || 15;
  return null;
}

export function confianceStation(s, cal) {
  if (s.confianceForcee) return { code: s.confianceForcee, detail: 'fixée à la main' };
  const pos = positionPlan(s, cal);
  if (!pos && !s.gps) return { code: 'aucune', detail: 'aucune position' };
  if (s.src === 'interpole') return { code: 'faible', detail: 'estimée par l\'heure' };
  if (s.src === 'pointe') return s.tardif ? { code: 'moyenne', detail: 'pointée après coup' } : { code: 'bonne', detail: 'pointée sur le plan' };
  const acc = s.gps?.acc ?? 99;
  if (!cal?.ok) return { code: acc <= 25 ? 'moyenne' : 'faible', detail: `GPS ±${Math.round(acc)} m, plan non calé` };
  const total = acc + (cal.emq ?? 3);
  if (s.tardif) return { code: total <= 25 ? 'moyenne' : 'faible', detail: `GPS après coup ±${Math.round(total)} m` };
  if (total <= 10) return { code: 'bonne', detail: `GPS ±${Math.round(total)} m` };
  if (total <= 25) return { code: 'moyenne', detail: `GPS ±${Math.round(total)} m` };
  return { code: 'faible', detail: `GPS ±${Math.round(total)} m` };
}

export function nomScan(options, numero) {
  return (options?.prefixe ?? 'Scan_') + String(numero).padStart(options?.chiffres ?? 3, '0');
}

export function prochainNumero(stations, options, scanner) {
  const n = stations.filter((s) => (s.scanner || '') === (scanner || '')).map((s) => s.numero || 0);
  return Math.max(n.length ? Math.max(...n) + 1 : 1, options?.numeroDepart || 1);
}

// ---------- Association avec les fichiers du scanner ----------
// fichiers : [{ nom, t }] (t = horodatage du fichier, en ms, ou null)
export function associerFichiers(stations, fichiers, toleranceMs = 5 * 60e3) {
  const base = (n) => String(n).replace(/\.[^.]+$/, '').toLowerCase();
  const libres = new Set(stations.map((s) => s.id));
  const paires = [];
  const restants = [];
  for (const f of fichiers) {
    const st = stations.find((s) => libres.has(s.id) && (s.nom || '').toLowerCase() === base(f.nom));
    if (st) { paires.push({ station: st, fichier: f, par: 'nom', dt: f.t ? f.t - st.heure : null }); libres.delete(st.id); }
    else restants.push(f);
  }
  const avecT = restants.filter((f) => f.t);
  const stLibres = stations.filter((s) => libres.has(s.id) && Number.isFinite(s.heure));

  // Appariement glouton (écart croissant) pour un décalage d'horloge donné
  const apparier = (decalage) => {
    const cand = [];
    for (const f of avecT) for (const s of stLibres) {
      const e = Math.abs(f.t - decalage - s.heure);
      if (e <= toleranceMs) cand.push({ f, s, e });
    }
    cand.sort((a, b) => a.e - b.e);
    const fPris = new Set(), sPris = new Set(), res = [];
    for (const c of cand) {
      if (fPris.has(c.f) || sPris.has(c.s.id)) continue;
      fPris.add(c.f); sPris.add(c.s.id);
      res.push(c);
    }
    // Score : beaucoup de paires ET des écarts serrés (noyau gaussien de 2 min)
    const score = res.reduce((t, c) => t + Math.exp(-((c.e / 120e3) ** 2)), 0);
    return { res, score };
  };

  // Décalage d'horloge du scanner : médiane des paires sûres (par le nom) si on en a,
  // sinon on essaie les décalages les plus fréquents et on garde celui qui donne les écarts les plus serrés.
  let decalage = 0;
  const sures = paires.filter((p) => p.dt != null).map((p) => p.dt).sort((a, b) => a - b);
  if (sures.length >= 2) decalage = sures[Math.floor(sures.length / 2)];
  else if (avecT.length && stLibres.length) {
    // Candidats : écarts bruts fichier − station les plus « denses » (voisins à ± 1 min), distants d'au moins 30 s
    const diffs = [];
    for (const f of avecT) for (const s of stLibres) { const d = f.t - s.heure; if (Math.abs(d) < 3 * 3600e3) diffs.push(d); }
    diffs.sort((a, b) => a - b);
    const densite = [];
    for (let i = 0, g = 0, d = 0; i < diffs.length; i++) {
      while (diffs[i] - diffs[g] > 60e3) g++;
      if (d < i) d = i;
      while (d + 1 < diffs.length && diffs[d + 1] - diffs[i] <= 60e3) d++;
      densite.push([diffs[i], d - g + 1]);
    }
    densite.sort((a, b) => b[1] - a[1]);
    const candidats = [0];
    for (const [v] of densite) {
      if (candidats.length > 80) break;
      if (candidats.every((c) => Math.abs(c - v) >= 30e3)) candidats.push(v);
    }
    let meilleur = { score: -1 };
    for (const c of candidats) {
      const r = apparier(c);
      if (r.score > meilleur.score + 1e-9) meilleur = { ...r, decalage: c };
    }
    // Affinage : médiane des écarts bruts des paires retenues
    const bruts = meilleur.res.map((x) => x.f.t - x.s.heure).sort((a, b) => a - b);
    decalage = bruts.length ? Math.round(bruts[Math.floor(bruts.length / 2)] / 1000) * 1000 : 0;
  }
  const { res } = apparier(decalage);
  const pris = new Set();
  for (const c of res) {
    pris.add(c.f);
    libres.delete(c.s.id);
    paires.push({ station: c.s, fichier: c.f, par: 'heure', dt: c.f.t - decalage - c.s.heure });
  }
  return {
    paires,
    decalage,
    fichiersSeuls: restants.filter((f) => !pris.has(f)),
    stationsSeules: stations.filter((s) => libres.has(s.id)),
  };
}

// Position estimée d'un scan non localisé, d'après les scans voisins dans le temps
export function interpolerPosition(t, stations, cal) {
  const pts = stations
    .map((s) => ({ s, p: positionPlan(s, cal) }))
    .filter((x) => x.p && x.s.src !== 'interpole' && Number.isFinite(x.s.heure))
    .sort((a, b) => a.s.heure - b.s.heure);
  let av = null, ap = null;
  for (const x of pts) { if (x.s.heure <= t) av = x; else { ap = x; break; } }
  const lim = 25 * 60e3;
  if (av && ap && t - av.s.heure < lim && ap.s.heure - t < lim) {
    const k = (t - av.s.heure) / Math.max(1, ap.s.heure - av.s.heure);
    return { x: av.p.x + (ap.p.x - av.p.x) * k, y: av.p.y + (ap.p.y - av.p.y) * k, entre: [av.s.nom, ap.s.nom] };
  }
  const proche = [av, ap].filter(Boolean).filter((x) => Math.abs(x.s.heure - t) < 15 * 60e3)
    .sort((a, b) => Math.abs(a.s.heure - t) - Math.abs(b.s.heure - t))[0];
  return proche ? { x: proche.p.x, y: proche.p.y, entre: [proche.s.nom] } : null;
}

// Lecture d'une liste collée : « Scan_012.fls 20/11/2026 10:42:13 », « Scan_012;2026-11-20 10:42 », « Scan_012 10:42 »…
export function lireListeFichiers(texte, jourDefaut = jourISO()) {
  const res = [];
  for (const brut of String(texte).split(/\r?\n/)) {
    const l = brut.trim();
    if (!l) continue;
    const nom = (l.match(/^\s*"?([^\s;,\t"]+)/) || [])[1];
    if (!nom || /^(nom|name|fichier)$/i.test(nom)) continue;
    let y, mo, d;
    const iso = l.match(/(\d{4})-(\d{2})-(\d{2})/);
    const fr = l.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (iso) [, y, mo, d] = iso.map(Number);
    else if (fr) { d = +fr[1]; mo = +fr[2]; y = +fr[3]; }
    else [y, mo, d] = jourDefaut.split('-').map(Number);
    const h = l.replace(nom, '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    const t = h ? new Date(y, mo - 1, d, +h[1], +h[2], +(h[3] || 0)).getTime() : null;
    res.push({ nom, t });
  }
  return res;
}

export function numeroDepuisNom(nom) {
  const m = String(nom).replace(/\.[^.]+$/, '').match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

// ---------- Exports ----------
function colonnesPosition(r, cal) {
  const p = positionPlan(r, cal);
  let gps = r.gps && r.src !== 'pointe' && r.src !== 'interpole' ? { lat: r.gps.lat, lon: r.gps.lon, acc: r.gps.acc } : null;
  if (!gps && p && cal?.ok) { const g = planVersGps(cal, p.x, p.y); gps = { lat: g.lat, lon: g.lon, acc: null, deduit: true }; }
  const loc = p && cal?.ok ? planVersLocal(cal, p.x, p.y) : null;
  const utm = gps ? versUTM(gps.lat, gps.lon) : null;
  const r1 = (v, d) => (v == null ? '' : Number(v.toFixed(d)));
  return [
    p ? r1(p.x, 1) : '', p ? r1(p.y, 1) : '',
    loc ? r1(loc.x, 2) : '', loc ? r1(loc.y, 2) : '',
    gps ? r1(gps.lat, 7) : '', gps ? r1(gps.lon, 7) : '', gps?.acc != null ? r1(gps.acc, 1) : (gps?.deduit ? 'déduit du plan' : ''),
    utm ? `${utm.zone}${utm.hemi}` : '', utm ? r1(utm.E, 2) : '', utm ? r1(utm.N, 2) : '',
  ];
}
const ENTETES_POSITION = ['plan_x_px', 'plan_y_px', 'local_E_m', 'local_N_m', 'latitude', 'longitude', 'precision_gps_m', 'utm_zone', 'utm_E_m', 'utm_N_m'];

export function csvStations(stations, cal) {
  const lignes = [['numero', 'nom', 'scanner', 'fichier_scanner', 'date', 'heure', 'operateur', 'confiance', 'detail_confiance', 'source_position', ...ENTETES_POSITION, 'note']];
  for (const s of [...stations].sort((a, b) => (a.heure || 0) - (b.heure || 0))) {
    const c = confianceStation(s, cal);
    lignes.push([
      s.numero ?? '', s.nom ?? '', s.scanner ?? '', s.fichier ?? '',
      s.heure ? jourISO(s.heure) : '', s.heure ? new Date(s.heure).toLocaleTimeString('fr-FR') : '',
      s.auteur ?? '', c.code, c.detail, s.src ?? '',
      ...colonnesPosition(s, cal), s.note ?? '',
    ]);
  }
  return csv(lignes);
}

export function csvEpingles(epingles, cal) {
  const lignes = [['categorie', 'repere', 'travee', 'commentaire', 'statut', 'nb_photos', 'operateur', 'date', 'heure', 'source_position', ...ENTETES_POSITION]];
  for (const e of [...epingles].sort((a, b) => a.cree_le - b.cree_le)) {
    lignes.push([
      CATEGORIES[e.categorie]?.nom ?? e.categorie, e.titre ?? '', e.travee ?? '', e.commentaire ?? '',
      e.statut === 'traite' ? 'relevé' : 'à vérifier', (e.photos || []).length, e.auteur ?? '',
      jourISO(e.cree_le), fmtHeure(e.cree_le), e.src ?? '', ...colonnesPosition(e, cal),
    ]);
  }
  return csv(lignes);
}
