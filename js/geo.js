// Géolocalisation et calage du plan.
// Calage = similitude 2D (échelle, rotation, translation) ajustée aux moindres carrés entre
// les points « je suis ici » (pixel du plan <-> GPS). 2 points suffisent, 3+ donnent un contrôle (écarts).

const R = 6378137;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function versLocal(lat, lon, lat0, lon0) {
  return { x: rad(lon - lon0) * R * Math.cos(rad(lat0)), y: rad(lat - lat0) * R };
}
export function depuisLocal(x, y, lat0, lon0) {
  return { lat: lat0 + deg(y / R), lon: lon0 + deg(x / (R * Math.cos(rad(lat0)))) };
}

export function distanceM(lat1, lon1, lat2, lon2) {
  const dl = rad(lat2 - lat1), dg = rad(lon2 - lon1);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dg / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function calculerCalage(points) {
  const P = (points || []).filter((p) => p.actif !== false && Number.isFinite(p.lat) && Number.isFinite(p.x));
  if (P.length < 2) {
    return { ok: false, n: P.length, raison: P.length ? '1 point : il en faut au moins 2' : 'Aucun point de calage' };
  }
  const n = P.length;
  const lat0 = P.reduce((s, p) => s + p.lat, 0) / n;
  const lon0 = P.reduce((s, p) => s + p.lon, 0) / n;
  const q = P.map((p) => versLocal(p.lat, p.lon, lat0, lon0));
  const u = P.map((p) => p.x);
  const v = P.map((p) => -p.y); // l'axe y de l'image descend, le nord monte
  const moy = (t) => t.reduce((s, x) => s + x, 0) / n;
  const um = moy(u), vm = moy(v), xm = moy(q.map((t) => t.x)), ym = moy(q.map((t) => t.y));
  let Spp = 0, Sa = 0, Sb = 0;
  for (let i = 0; i < n; i++) {
    const du = u[i] - um, dv = v[i] - vm, dx = q[i].x - xm, dy = q[i].y - ym;
    Spp += du * du + dv * dv;
    Sa += du * dx + dv * dy;
    Sb += du * dy - dv * dx;
  }
  if (Spp < 1) return { ok: false, n, raison: 'Points confondus sur le plan' };
  const a = Sa / Spp, b = Sb / Spp;
  const tx = xm - (a * um - b * vm);
  const ty = ym - (b * um + a * vm);
  const echelle = Math.hypot(a, b); // mètres par pixel du plan
  const residus = P.map((p, i) => {
    const X = a * u[i] - b * v[i] + tx, Y = b * u[i] + a * v[i] + ty;
    return { id: p.id, ecart: Math.hypot(X - q[i].x, Y - q[i].y) };
  });
  const emq = n > 2 ? Math.sqrt(residus.reduce((s, r) => s + r.ecart ** 2, 0) / (n - 2)) : null;
  let etendue = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) etendue = Math.max(etendue, Math.hypot(q[i].x - q[j].x, q[i].y - q[j].y));
  const precisionGps = P.reduce((s, p) => s + (p.acc || 5), 0) / n;
  // Rotation : angle du nord vers la droite du haut de la feuille
  const nord = (deg(Math.atan2(b, a)) + 360) % 360;
  let qualite = 'bonne';
  if (n === 2) qualite = 'non contrôlée';
  else if (emq > 12) qualite = 'mauvaise';
  else if (emq > 6) qualite = 'moyenne';
  if (etendue < 15) qualite = 'mauvaise';
  return { ok: true, n, a, b, tx, ty, lat0, lon0, echelle, nord, residus, emq, etendue, precisionGps, qualite };
}

export function gpsVersPlan(cal, lat, lon) {
  if (!cal?.ok) return null;
  const q = versLocal(lat, lon, cal.lat0, cal.lon0);
  const dx = q.x - cal.tx, dy = q.y - cal.ty, k = cal.a * cal.a + cal.b * cal.b;
  return { x: (cal.a * dx + cal.b * dy) / k, y: -((-cal.b * dx + cal.a * dy) / k) };
}
export function planVersLocal(cal, x, y) {
  const u = x, v = -y;
  return { x: cal.a * u - cal.b * v + cal.tx, y: cal.b * u + cal.a * v + cal.ty };
}
export function planVersGps(cal, x, y) {
  if (!cal?.ok) return null;
  const l = planVersLocal(cal, x, y);
  return depuisLocal(l.x, l.y, cal.lat0, cal.lon0);
}

// UTM (WGS84) — zone automatique (20 N en Martinique)
export function versUTM(lat, lon) {
  const zone = Math.floor((lon + 180) / 6) + 1;
  const l0 = rad((zone - 1) * 6 - 180 + 3);
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const p = rad(lat), l = rad(lon);
  const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const T = Math.tan(p) ** 2, C = ep2 * Math.cos(p) ** 2, A = Math.cos(p) * (l - l0);
  const M = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * p
    - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p)
    - ((35 * e2 ** 3) / 3072) * Math.sin(6 * p));
  const E = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
  let No = k0 * (M + N * Math.tan(p) * ((A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24
    + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  if (lat < 0) No += 10000000;
  return { zone, hemi: lat >= 0 ? 'N' : 'S', E, N: No };
}

// Lecture d'une saisie « 14.60941, -60.99322 » (copiée depuis une carte en ligne)
export function lireCoordonnees(texte) {
  const m = String(texte).replace(/[()°]/g, ' ').match(/(-?\d{1,3}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
  return { lat, lon };
}

// ---------- Position du téléphone ----------
let simulation = null;     // { lat, lon } en mode démonstration
let suiviId = null;
let dernier = null;        // dernier point GPS reçu
const ecouteurs = new Set();

export const simulationActive = () => !!simulation;
export function definirSimulation(pos) {
  simulation = pos;
  if (pos) diffuser({ lat: pos.lat, lon: pos.lon, acc: 3, t: Date.now(), simule: true });
}
function diffuser(fix) {
  dernier = fix;
  for (const f of ecouteurs) f(fix);
}
export const dernierePosition = (ageMax = 15000) => (dernier && Date.now() - dernier.t <= ageMax ? dernier : null);
export const gpsPossible = () => !!simulation || 'geolocation' in navigator;

export function ecouterPosition(fn) { ecouteurs.add(fn); return () => ecouteurs.delete(fn); }

// Suivi continu (point bleu) : tant que l'application est au premier plan
export function demarrerSuivi(surErreur) {
  if (simulation || suiviId != null || !('geolocation' in navigator)) return;
  suiviId = navigator.geolocation.watchPosition(
    (p) => diffuser({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() }),
    (e) => { if (e.code === e.PERMISSION_DENIED) { arreterSuivi(); surErreur?.(e); } },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 },
  );
}
export function arreterSuivi() {
  if (suiviId != null) navigator.geolocation.clearWatch(suiviId);
  suiviId = null;
}
export const suiviActif = () => suiviId != null || !!simulation;

function bruitSimule(pos, metres = 2.5) {
  const ang = Math.random() * 2 * Math.PI, r = Math.random() * metres;
  const l = versLocal(pos.lat, pos.lon, pos.lat, pos.lon);
  return depuisLocal(l.x + r * Math.cos(ang), l.y + r * Math.sin(ang), pos.lat, pos.lon);
}

// Collecte de positions sur une durée, moyenne pondérée des meilleures mesures.
export class Collecteur {
  constructor() {
    this.echantillons = [];
    this.id = null;
    this.erreur = null;
    this.ecouteurs = new Set();
  }
  demarrer(dureeMax = 60000) {
    if (simulation) {
      const p = bruitSimule(simulation);
      this.echantillons.push({ lat: p.lat, lon: p.lon, acc: 3, t: Date.now(), simule: true });
      return this;
    }
    if (!('geolocation' in navigator)) { this.erreur = 'Pas de GPS sur cet appareil'; return this; }
    const d = dernierePosition(5000);
    if (d && !d.simule) this.echantillons.push(d);
    this.id = navigator.geolocation.watchPosition(
      (p) => {
        const e = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
        this.echantillons.push(e);
        diffuser(e);
        for (const f of this.ecouteurs) f(e, this.resultat());
      },
      (e) => { this.erreur = e.code === e.PERMISSION_DENIED ? 'Accès à la position refusé' : 'GPS indisponible'; if (e.code === e.PERMISSION_DENIED) this.arreter(); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: dureeMax },
    );
    this.garde = setTimeout(() => this.arreter(), dureeMax);
    return this;
  }
  surMesure(fn) { this.ecouteurs.add(fn); }
  arreter() {
    if (this.id != null) navigator.geolocation.clearWatch(this.id);
    this.id = null;
    clearTimeout(this.garde);
  }
  resultat() {
    const E = this.echantillons;
    if (!E.length) return null;
    const best = Math.min(...E.map((e) => e.acc));
    const bons = E.filter((e) => e.acc <= Math.max(best * 1.5, best + 3));
    let sw = 0, la = 0, lo = 0;
    for (const e of bons) { const w = 1 / Math.max(1, e.acc) ** 2; sw += w; la += e.lat * w; lo += e.lon * w; }
    return { lat: la / sw, lon: lo / sw, acc: best, nb: E.length, t: Date.now(), simule: !!E[0].simule };
  }
  // Attend une précision cible (ou le délai), puis rend le meilleur résultat obtenu.
  attendre({ cible = 6, dureeMin = 0, dureeMax = 8000 } = {}) {
    const t0 = Date.now();
    return new Promise((res) => {
      const verifier = () => {
        const r = this.resultat();
        const ecoule = Date.now() - t0;
        if ((r && r.acc <= cible && ecoule >= dureeMin) || ecoule >= dureeMax || (this.erreur && !this.id)) {
          clearInterval(minuteur);
          res(r);
          return true;
        }
        return false;
      };
      const minuteur = setInterval(verifier, 250);
      verifier();
    });
  }
}

export async function obtenirPosition(opts = {}) {
  const c = new Collecteur().demarrer(opts.dureeMax ? opts.dureeMax + 1000 : 10000);
  if (opts.surMesure) c.surMesure(opts.surMesure);
  const r = await c.attendre(opts);
  c.arreter();
  if (!r && c.erreur) throw new Error(c.erreur);
  return r;
}
