// Dessin des couches au-dessus du plan : zones peintes, épingles, stations, points de calage, GPS.
import { CATEGORIES, CONFIANCE, PEINTURE, rgba } from './config.js';

export function tracerTrait(ctx, t) {
  const p = t.pts;
  if (!p || p.length < 2) return;
  ctx.lineWidth = t.largeur;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  if (p.length === 2) ctx.lineTo(p[0] + 0.01, p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.stroke();
}

// Chaque état est peint opaque sur une couche hors écran, puis posé en transparence :
// les coups de pinceau qui se chevauchent ne foncent pas. Le « fait » efface le « prévu » dessous.
export function dessinerAvancement(ctx, vue, traits, jour) {
  const couche = vue.couche();
  const lc = couche.getContext('2d');
  const duJour = (t) => jour === 'tout' || t.jour === jour;
  for (const etat of ['perimetre', 'prevu', 'fait']) {
    const propres = traits.filter((t) => (t.etat === etat || (t.etat === 'gomme' && t.cible === etat)) && (etat === 'perimetre' || duJour(t)));
    if (!propres.some((t) => t.etat === etat)) continue;
    const effaceurs = etat === 'prevu' ? traits.filter((t) => t.etat === 'fait' && duJour(t)) : [];
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, couche.width, couche.height);
    lc.setTransform(vue.dpr * vue.s, 0, 0, vue.dpr * vue.s, vue.dpr * vue.tx, vue.dpr * vue.ty);
    lc.strokeStyle = PEINTURE[etat].couleur;
    for (const t of [...propres, ...effaceurs]) {
      lc.globalCompositeOperation = t.etat === etat ? 'source-over' : 'destination-out';
      tracerTrait(lc, t);
    }
    lc.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = PEINTURE[etat].alpha;
    ctx.drawImage(couche, 0, 0);
    ctx.restore();
  }
}

export function dessinerTraitEnCours(ctx, vue, t) {
  if (!t) return;
  ctx.save();
  ctx.translate(vue.tx, vue.ty);
  ctx.scale(vue.s, vue.s);
  ctx.globalAlpha = t.etat === 'gomme' ? 0.35 : 0.5;
  ctx.strokeStyle = t.etat === 'gomme' ? '#ffffff' : PEINTURE[t.etat].couleur;
  tracerTrait(ctx, t);
  ctx.restore();
}

export function dessinerEpingle(ctx, X, Y, e, selection) {
  const c = CATEGORIES[e.categorie] || CATEGORIES.photo;
  const r = selection ? 15 : 12;
  const h = r * 2.4;
  const cy = -h + r;
  ctx.save();
  ctx.translate(X, Y);
  if (selection) {
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7);
    ctx.fillStyle = rgba(c.couleur, 0.25); ctx.fill();
  }
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-r * 0.35, -r * 0.8, -r, cy + r * 0.9, -r, cy);
  ctx.arc(0, cy, r, Math.PI, 0);
  ctx.bezierCurveTo(r, cy + r * 0.9, r * 0.35, -r * 0.8, 0, 0);
  ctx.closePath();
  ctx.fillStyle = e.statut === 'traite' ? rgba(c.couleur, 0.75) : c.couleur;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${selection ? 14 : 12}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(c.lettre, 0, cy + 0.5);
  if ((e.photos || []).length) {
    ctx.beginPath(); ctx.arc(-r * 0.85, cy - r * 0.75, 6, 0, 7);
    ctx.fillStyle = '#16202A'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 9px system-ui, sans-serif';
    ctx.fillText(String(e.photos.length), -r * 0.85, cy - r * 0.75 + 0.5);
  }
  if (e.statut === 'traite') {
    ctx.beginPath(); ctx.arc(r * 0.85, cy - r * 0.75, 6.5, 0, 7);
    ctx.fillStyle = '#1F9D55'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(r * 0.85 - 3, cy - r * 0.75); ctx.lineTo(r * 0.85 - 0.8, cy - r * 0.75 + 2.4); ctx.lineTo(r * 0.85 + 3.2, cy - r * 0.75 - 2.6); ctx.stroke();
  }
  if (selection && (e.titre || e.travee)) etiquette(ctx, 0, 14, [e.titre, e.travee].filter(Boolean).join(' · '));
  ctx.restore();
}

export function dessinerStation(ctx, X, Y, st, code, rayonIncertitude, selection) {
  const col = CONFIANCE[code].couleur;
  ctx.save();
  if (rayonIncertitude > 13) {
    ctx.beginPath(); ctx.arc(X, Y, rayonIncertitude, 0, 7);
    ctx.fillStyle = rgba(col, 0.08); ctx.fill();
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(col, 0.55); ctx.stroke(); ctx.setLineDash([]);
  }
  const r = selection ? 15 : 12;
  ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 3;
  ctx.beginPath(); ctx.arc(X, Y, r, 0, 7);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 3.5; ctx.strokeStyle = col;
  if (code === 'faible') ctx.setLineDash([4, 3]);
  ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath();
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    ctx.moveTo(X + dx * (r + 1), Y + dy * (r + 1));
    ctx.lineTo(X + dx * (r + 6), Y + dy * (r + 6));
  }
  ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = col;
  ctx.font = `800 ${String(st.numero ?? '?').length > 2 ? 10 : 12}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(st.numero ?? '?'), X, Y + 0.5);
  if (selection) etiquette(ctx, X, Y + r + 10, st.nom || '');
  ctx.restore();
}

export function dessinerPointCalage(ctx, X, Y, p, ecart) {
  ctx.save();
  ctx.translate(X, Y);
  ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(11, 7); ctx.lineTo(-11, 7); ctx.closePath();
  ctx.fillStyle = p.actif === false ? '#9CA3AF' : '#BE185D'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
  const t = (p.nom || 'Point') + (ecart != null ? ` · ${ecart.toFixed(1).replace('.', ',')} m` : '');
  etiquette(ctx, 0, 12, t, '#BE185D');
  ctx.restore();
}

export function dessinerGPS(ctx, X, Y, rayon, simule) {
  ctx.save();
  if (rayon > 8) {
    ctx.beginPath(); ctx.arc(X, Y, rayon, 0, 7);
    ctx.fillStyle = 'rgba(37,99,235,.12)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(37,99,235,.5)'; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(X, Y, 8, 0, 7);
  ctx.fillStyle = simule ? '#7C3AED' : '#2563EB'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.restore();
}

function etiquette(ctx, X, Y, texte, couleur = '#16202A') {
  if (!texte) return;
  ctx.font = '600 12px system-ui, sans-serif';
  const w = Math.min(240, ctx.measureText(texte).width + 12);
  ctx.fillStyle = 'rgba(255,255,255,.94)';
  ctx.strokeStyle = 'rgba(0,0,0,.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(X - w / 2, Y, w, 20, 6) : ctx.rect(X - w / 2, Y, w, 20);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = couleur;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(texte, X, Y + 10.5, w - 8);
}
