// Briques d'interface : icônes, feuille du bas, messages, formulaires, visionneuse de photos.
import { $, esc } from './outils.js';

const ICONES = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  camera: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2l1.6-2h5.8l1.6 2h2A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.8"/>',
  epingle: '<path d="M12 21s-6.5-5.8-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.2 12 21 12 21z"/><path d="M12 6.8v6M9 9.8h6"/>',
  cible: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.6"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>',
  gps: '<path d="M3.5 11.2 20.5 3.5l-7.7 17-1.9-7.4z"/>',
  liste: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1.3"/><circle cx="4" cy="12" r="1.3"/><circle cx="4" cy="18" r="1.3"/>',
  pinceau: '<path d="M18.2 2.8a2.1 2.1 0 0 1 3 3L11.5 15.5l-3-3z"/><path d="M7.2 13.8c-2.1 0-3.2 1.5-3.2 3.1 0 1.4-.9 2.4-2 3 3.2 1 7.4.4 8.1-3.2z"/>',
  calage: '<path d="M12 3 21 19H3z"/><circle cx="12" cy="13.5" r="1.6"/>',
  plus: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  plan: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  fermer: '<path d="M6 6l12 12M18 6 6 18"/>',
  micro: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  partager: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  recevoir: '<path d="M12 15V3M7 10l5 5 5-5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
  annuler: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  gomme: '<path d="M20 20H9.5L4 14.5a2 2 0 0 1 0-2.8l8-8a2 2 0 0 1 2.8 0l5.2 5.2a2 2 0 0 1 0 2.8L12.5 20"/><path d="M7.5 10.5l6 6"/>',
  nuage: '<path d="M7 18a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19.2 10 4 4 0 0 1 18 18z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  poubelle: '<path d="M4 7h16M9.5 7V4h5v3M6 7l1 13h10l1-13"/>',
  deplacer: '<path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>',
  calques: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  ok: '<path d="m5 12.5 4.5 4.5L19.5 7"/>',
  gauche: '<path d="m15 6-6 6 6 6"/>',
  droite: '<path d="m9 6 6 6-6 6"/>',
  personne: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  dossier: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
  horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  lien: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  reglages: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  fichier: '<path d="M14 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9z"/><path d="M14 3v6h6"/>',
  attention: '<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.5v.5"/>',
};

export function icone(nom, taille = 22) {
  return `<svg class="ic" width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nom] || ''}</svg>`;
}

// ---------- Feuille du bas ----------
let surFermeture = null;
export function ouvrirFeuille(html, { haute = false, modale = false, onFermer = null, cle = '' } = {}) {
  const f = $('#feuille');
  const ancienne = surFermeture;
  surFermeture = null;
  if (ancienne && f.dataset.cle !== cle) ancienne();
  surFermeture = onFermer;
  f.dataset.cle = cle;
  $('#feuille-contenu').innerHTML = html;
  f.classList.toggle('haute', haute);
  f.hidden = false;
  $('#voile').hidden = !modale;
  document.body.classList.add('feuille-active');
  f.classList.add('ouverte');
  document.dispatchEvent(new CustomEvent('feuille', { detail: { ouverte: true, cle } }));
  return $('#feuille-contenu');
}
export function fermerFeuille() {
  const f = $('#feuille');
  if (f.hidden) return;
  f.classList.remove('ouverte');
  f.hidden = true;
  f.dataset.cle = '';
  $('#voile').hidden = true;
  document.body.classList.remove('feuille-active');
  const cb = surFermeture;
  surFermeture = null;
  cb?.();
  document.dispatchEvent(new CustomEvent('feuille', { detail: { ouverte: false } }));
}
export const feuilleOuverte = (cle) => !$('#feuille').hidden && (cle == null || $('#feuille').dataset.cle === cle);

// ---------- Messages ----------
let toastCourant = null;
export function toast(html, { actions = [], duree = 4500 } = {}) {
  toastCourant?.fermer(true);
  const el = document.createElement('div');
  el.className = 'toast';
  $('#toasts').appendChild(el);
  let minuteur;
  const t = {
    maj(h, o = {}) {
      el.innerHTML = `<div class="toast-txt">${h}</div>${(o.actions || []).length ? `<div class="toast-actions">${o.actions.map((a, i) => `<button data-i="${i}">${esc(a.libelle)}</button>`).join('')}</div>` : ''}`;
      el.querySelectorAll('button[data-i]').forEach((b) => b.addEventListener('click', () => { t.fermer(); o.actions[+b.dataset.i].fn(); }));
      clearTimeout(minuteur);
      if (o.duree !== 0) minuteur = setTimeout(() => t.fermer(), o.duree || 4500);
      return t;
    },
    fermer(immediat) {
      clearTimeout(minuteur);
      if (toastCourant === t) toastCourant = null;
      if (immediat) el.remove(); else { el.classList.add('sortie'); setTimeout(() => el.remove(), 200); }
    },
  };
  toastCourant = t;
  return t.maj(html, { actions, duree });
}

// ---------- Formulaires modaux ----------
export function demander({ titre, texte = '', champs = [], ok = 'Valider', annuler = 'Annuler' }) {
  return new Promise((resolve) => {
    let fini = false;
    const html = `<div class="tete-feuille"><h2>${esc(titre)}</h2></div>
      ${texte ? `<p class="aide">${texte}</p>` : ''}
      <form class="formulaire">${champs.map((c) => champHtml(c)).join('')}
      <div class="actions-feuille"><button type="button" class="btn" data-a="annuler">${esc(annuler)}</button><button type="submit" class="btn principal">${esc(ok)}</button></div></form>`;
    const racine = ouvrirFeuille(html, { modale: true, cle: 'demander', onFermer: () => { if (!fini) { fini = true; resolve(null); } } });
    const form = racine.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = {};
      for (const c of champs) {
        const el = form.elements[c.nom];
        v[c.nom] = c.type === 'case' ? el.checked : el.value;
      }
      fini = true;
      fermerFeuille();
      resolve(v);
    });
    racine.querySelector('[data-a="annuler"]').addEventListener('click', () => fermerFeuille());
    setTimeout(() => form.querySelector('input:not([type=checkbox]),textarea,select')?.focus(), 50);
  });
}

function champHtml(c) {
  const id = 'c-' + c.nom;
  if (c.type === 'case') return `<label class="case"><input type="checkbox" name="${c.nom}" ${c.valeur ? 'checked' : ''}> <span>${esc(c.libelle)}</span></label>`;
  if (c.type === 'choix') return `<label class="champ" for="${id}"><span>${esc(c.libelle)}</span><select id="${id}" name="${c.nom}">${c.options.map((o) => `<option value="${esc(o.val ?? o)}" ${(o.val ?? o) === c.valeur ? 'selected' : ''}>${esc(o.libelle ?? o)}</option>`).join('')}</select></label>`;
  if (c.type === 'zone') return `<label class="champ" for="${id}"><span>${esc(c.libelle)}</span><textarea id="${id}" name="${c.nom}" rows="${c.lignes || 4}" placeholder="${esc(c.placeholder || '')}">${esc(c.valeur || '')}</textarea></label>`;
  return `<label class="champ" for="${id}"><span>${esc(c.libelle)}</span><input id="${id}" name="${c.nom}" type="${c.type || 'text'}" value="${esc(c.valeur ?? '')}" placeholder="${esc(c.placeholder || '')}" ${c.attrs || ''} autocomplete="off"></label>`;
}

export function choisir({ titre, texte = '', boutons }) {
  return new Promise((resolve) => {
    let fini = false;
    const html = `<div class="tete-feuille"><h2>${esc(titre)}</h2></div>${texte ? `<p class="aide">${texte}</p>` : ''}
      <div class="pile-boutons">${boutons.map((b, i) => `<button class="btn ${b.principal ? 'principal' : ''} ${b.danger ? 'danger' : ''}" data-i="${i}">${b.icone ? icone(b.icone, 20) : ''}<span>${esc(b.libelle)}</span></button>`).join('')}
      <button class="btn discret" data-i="-1">Annuler</button></div>`;
    const racine = ouvrirFeuille(html, { modale: true, cle: 'choisir', onFermer: () => { if (!fini) { fini = true; resolve(null); } } });
    racine.querySelectorAll('button[data-i]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      fini = true;
      fermerFeuille();
      resolve(i < 0 ? null : boutons[i].val);
    }));
  });
}

export async function confirmer(texte, ok = 'Confirmer', danger = false) {
  return (await choisir({ titre: 'Confirmation', texte: esc(texte), boutons: [{ val: true, libelle: ok, principal: !danger, danger }] })) === true;
}

// ---------- Visionneuse de photos ----------
export function voirPhotos(urls, index = 0, { surRetirer } = {}) {
  const v = $('#visionneuse-photo');
  let i = index;
  const rendre = () => {
    v.innerHTML = `<img src="${urls[i]}" alt="Photo ${i + 1}">
      <div class="vp-barre"><span>${i + 1} / ${urls.length}</span>
      ${surRetirer ? `<button class="btn discret clair" data-a="retirer">${icone('poubelle', 18)} Retirer</button>` : ''}
      <button class="btn clair" data-a="fermer">Fermer</button></div>
      ${urls.length > 1 ? `<button class="vp-nav g" data-a="prec">${icone('gauche', 30)}</button><button class="vp-nav d" data-a="suiv">${icone('droite', 30)}</button>` : ''}`;
  };
  v.onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'fermer' || e.target === v) { v.hidden = true; v.innerHTML = ''; }
    else if (a === 'prec') { i = (i - 1 + urls.length) % urls.length; rendre(); }
    else if (a === 'suiv') { i = (i + 1) % urls.length; rendre(); }
    else if (a === 'retirer') { v.hidden = true; v.innerHTML = ''; surRetirer(i); }
  };
  rendre();
  v.hidden = false;
}
