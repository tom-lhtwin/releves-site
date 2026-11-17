// Images : compression des photos, import du plan (image, SVG ou PDF), lecture EXIF.

export const MAX_PLAN = 4096;   // limite raisonnable pour la mémoire des téléphones
export const MAX_PHOTO = 2400;  // assez pour lire une plaque signalétique cadrée de près

async function decoder(fichier) {
  const estSvg = /svg/.test(fichier.type) || /\.svg$/i.test(fichier.name || '');
  if (!estSvg && self.createImageBitmap) {
    try {
      const b = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
      return { source: b, w: b.width, h: b.height, fermer: () => b.close?.() };
    } catch { /* repli sur <img> */ }
  }
  const url = URL.createObjectURL(fichier);
  const img = await charger(url);
  let w = img.naturalWidth, h = img.naturalHeight;
  if (estSvg && (!w || !h)) { w = 3000; h = 2000; }
  return { source: img, w, h, fermer: () => URL.revokeObjectURL(url) };
}

export async function redimensionner(fichier, maxDim, type = 'image/jpeg', qualite = 0.85, agrandir = false) {
  const d = await decoder(fichier);
  const k = agrandir ? maxDim / Math.max(d.w, d.h) : Math.min(1, maxDim / Math.max(d.w, d.h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(d.w * k));
  c.height = Math.max(1, Math.round(d.h * k));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(d.source, 0, 0, c.width, c.height);
  d.fermer();
  const blob = await new Promise((r) => c.toBlob(r, type, qualite));
  return { blob, w: c.width, h: c.height };
}

export const compresserPhoto = (f) => redimensionner(f, MAX_PHOTO, 'image/jpeg', 0.85);

export async function importerPlan(fichier, surProgres) {
  const nom = fichier.name || 'plan';
  if (fichier.type === 'application/pdf' || /\.pdf$/i.test(nom)) return pdfVersImage(fichier, surProgres);
  const estSvg = /svg/.test(fichier.type) || /\.svg$/i.test(nom);
  const png = estSvg || /png|gif/.test(fichier.type);
  return redimensionner(fichier, MAX_PLAN, png ? 'image/png' : 'image/jpeg', 0.92, estSvg);
}

async function pdfVersImage(fichier, surProgres) {
  surProgres?.('Lecture du PDF…');
  const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const base = new URL('../vendor/pdfjs/', import.meta.url).href;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await fichier.arrayBuffer()),
    isEvalSupported: false,
    standardFontDataUrl: base + 'standard_fonts/',
    cMapUrl: base + 'cmaps/',
    cMapPacked: true,
  }).promise;
  const page = await doc.getPage(1);
  const v1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: MAX_PLAN / Math.max(v1.width, v1.height) });
  const c = document.createElement('canvas');
  c.width = Math.floor(vp.width);
  c.height = Math.floor(vp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  surProgres?.('Rendu de la page 1…');
  // Intention « print » : rendu d'une traite, sans dépendre du rafraîchissement de l'écran
  // (l'import continue si l'utilisateur passe sur une autre appli).
  await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
  const pages = doc.numPages;
  await doc.destroy();
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return { blob, w: c.width, h: c.height, pages };
}

// Chargement par l'événement « load » (et non decode(), qui attend que la page soit affichée)
function charger(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Image illisible'));
    img.src = url;
  });
}
export const chargerImage = charger;

// ---------- EXIF minimal : date de prise de vue et GPS ----------
export async function lireExif(fichier) {
  try {
    const dv = new DataView(await fichier.slice(0, 256 * 1024).arrayBuffer());
    if (dv.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off + 4 < dv.byteLength) {
      const marqueur = dv.getUint16(off);
      if ((marqueur & 0xff00) !== 0xff00) break;
      const lg = dv.getUint16(off + 2);
      if (marqueur === 0xffe1 && dv.getUint32(off + 4) === 0x45786966) return lireTiff(dv, off + 10);
      off += 2 + lg;
    }
  } catch { /* fichier sans EXIF lisible */ }
  return null;
}

function lireTiff(dv, t) {
  const le = dv.getUint16(t) === 0x4949;
  const u16 = (o) => dv.getUint16(t + o, le);
  const u32 = (o) => dv.getUint32(t + o, le);
  const lireIFD = (o) => {
    const n = u16(o), tags = {};
    for (let i = 0; i < n; i++) {
      const e = o + 2 + i * 12;
      tags[u16(e)] = { type: u16(e + 2), nb: u32(e + 4), pos: e + 8 };
    }
    return tags;
  };
  const valeur = ({ type, nb, pos }) => {
    const taille = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] || 1;
    const o = taille * nb > 4 ? u32(pos) : pos;
    if (type === 2) { let s = ''; for (let i = 0; i < nb - 1; i++) s += String.fromCharCode(dv.getUint8(t + o + i)); return s; }
    if (type === 5) { const r = []; for (let i = 0; i < nb; i++) r.push(u32(o + i * 8) / u32(o + i * 8 + 4)); return r; }
    if (type === 3) return u16(o);
    if (type === 4) return u32(o);
    return null;
  };
  const dateExif = (s) => {
    const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null;
  };
  const res = {};
  const ifd0 = lireIFD(u32(4));
  if (ifd0[0x8769]) {
    const ex = lireIFD(valeur(ifd0[0x8769]));
    if (ex[0x9003]) res.date = dateExif(valeur(ex[0x9003]));
  }
  if (!res.date && ifd0[0x0132]) res.date = dateExif(valeur(ifd0[0x0132]));
  if (ifd0[0x8825]) {
    const g = lireIFD(valeur(ifd0[0x8825]));
    if (g[2] && g[4]) {
      const dms = (v) => v[0] + v[1] / 60 + v[2] / 3600;
      let lat = dms(valeur(g[2])), lon = dms(valeur(g[4]));
      if (g[1] && valeur(g[1]) === 'S') lat = -lat;
      if (g[3] && valeur(g[3]) === 'W') lon = -lon;
      if (Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon)) { res.lat = lat; res.lon = lon; }
    }
    if (g[0x1f]) { const v = valeur(g[0x1f]); res.acc = Array.isArray(v) ? v[0] : v; }
  }
  return res;
}

// Photo d'illustration pour le projet d'exemple (plaque signalétique dessinée)
export async function photoExemple(titre, lignes, teinte = '#8a929a') {
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 900;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 1200, 900);
  g.addColorStop(0, '#5d6d5a'); g.addColorStop(1, '#2f3b33');
  x.fillStyle = g; x.fillRect(0, 0, 1200, 900);
  x.fillStyle = teinte; x.fillRect(150, 140, 900, 620);
  x.strokeStyle = '#d7dbdf'; x.lineWidth = 8; x.strokeRect(170, 160, 860, 580);
  x.fillStyle = '#d0d4d8';
  for (const [a, b] of [[195, 185], [1005, 185], [195, 715], [1005, 715]]) { x.beginPath(); x.arc(a, b, 12, 0, 7); x.fill(); }
  x.fillStyle = '#111';
  x.font = 'bold 54px Arial'; x.textAlign = 'center';
  x.fillText(titre, 600, 260);
  x.font = '40px Arial';
  lignes.forEach((l, i) => x.fillText(l, 600, 350 + i * 70));
  x.font = 'bold 30px Arial'; x.fillStyle = '#b42318';
  x.fillText('PHOTO D\'EXEMPLE — FICTIVE', 600, 820);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
}
