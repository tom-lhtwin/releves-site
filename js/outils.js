// Outils communs (sans dépendance)

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function uid() {
  if (globalThis.crypto?.randomUUID) {
    try { return crypto.randomUUID(); } catch { /* contexte non sécurisé : repli */ }
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const deux = (n) => String(n).padStart(2, '0');

export function jourISO(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}
export function decalerJour(jour, n) {
  const [y, m, d] = jour.split('-').map(Number);
  return jourISO(new Date(y, m - 1, d + n).getTime());
}
export function fmtJour(jour) {
  const [y, m, d] = jour.split('-').map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return jour === jourISO() ? `Aujourd'hui, ${new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : s;
}
export const fmtHeure = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export const fmtDateHeure = (t) =>
  new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const fmtNb = (n, dec = 0) =>
  Number(n).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export function fmtDuree(ms) {
  const s = Math.round(Math.abs(ms) / 1000);
  const signe = ms < 0 ? '−' : '+';
  if (s < 60) return `${signe}${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${signe}${m} min ${deux(s % 60)} s`;
  return `${signe}${Math.floor(m / 60)} h ${deux(m % 60)}`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function couleurNom(nom = '') {
  let h = 0;
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${(h * 7) % 360} 48% 38%)`;
}
export function initiales(nom = '') {
  const m = nom.trim().split(/\s+/).filter(Boolean);
  if (!m.length) return '?';
  return (m.length > 1 ? m[0][0] + m[1][0] : m[0].slice(0, 2)).toUpperCase();
}

export const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

export function telecharger(blob, nom) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
}

// Partage natif (Quick Share, AirDrop, WhatsApp…) si le navigateur l'accepte, sinon téléchargement.
export async function partagerOuTelecharger(blob, nom, titre, typesRepli = []) {
  const essais = [[nom, blob.type], ...typesRepli];
  if (navigator.canShare) {
    for (const [n, type] of essais) {
      const f = new File([blob], n, { type });
      if (navigator.canShare({ files: [f] })) {
        try {
          await navigator.share({ files: [f], title: titre });
          return 'partage';
        } catch (e) {
          if (e.name === 'AbortError') return 'annule';
        }
        break;
      }
    }
  }
  telecharger(blob, nom);
  return 'telecharge';
}

export function blobVersBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
export function base64VersBlob(b64, type) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
}

export function csv(lignes, sep = ';') {
  const cell = (v) => {
    if (v == null) return '';
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[";\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + lignes.map((l) => l.map(cell).join(sep)).join('\r\n');
}

export function nomFichierSur(s) {
  return String(s || 'projet').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
