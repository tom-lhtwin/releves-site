// Visionneuse de plan : déplacement et zoom au doigt (un doigt = déplacer, deux doigts = zoomer),
// appui long, double-tape pour zoomer, et mode « peindre » (un doigt peint, deux doigts déplacent).

export class Visionneuse {
  constructor(canvas, dessiner) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.dessiner = dessiner;
    this.img = null; this.w = 0; this.h = 0;
    this.s = 1; this.tx = 0; this.ty = 0;
    this.L = 1; this.H = 1; this.dpr = 1;
    this.pointeurs = new Map();
    this.mode = 'naviguer';
    this.cb = {};
    this.enGeste = false;
    this._couche = document.createElement('canvas');
    new ResizeObserver(() => this.redimensionner()).observe(canvas.parentElement);
    canvas.addEventListener('pointerdown', (e) => this.bas(e));
    canvas.addEventListener('pointermove', (e) => this.bouge(e));
    canvas.addEventListener('pointerup', (e) => this.haut(e, false));
    canvas.addEventListener('pointercancel', (e) => this.haut(e, true));
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); const p = this.coord(e); this.zoomer(Math.exp(-e.deltaY * 0.0015), p.X, p.Y); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.redimensionner();
  }

  redimensionner() {
    const r = this.c.parentElement.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const ancienL = this.L, ancienH = this.H;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.L = r.width; this.H = r.height;
    this.c.width = Math.round(r.width * this.dpr);
    this.c.height = Math.round(r.height * this.dpr);
    this.c.style.width = r.width + 'px';
    this.c.style.height = r.height + 'px';
    if (this.img && !this.cadre) this.ajuster();
    else { this.tx += (this.L - ancienL) / 2; this.ty += (this.H - ancienH) / 2; }
    this.rendre();
  }

  definirImage(img, w, h) {
    this.img = img; this.w = w; this.h = h; this.cadre = false;
    this.ajuster();
  }

  ajuster() {
    if (!this.w || !this.L) return;
    const k = Math.min(this.L / this.w, this.H / this.h) * 0.94;
    this.s = k;
    this.tx = (this.L - this.w * k) / 2;
    this.ty = (this.H - this.h * k) / 2;
    this.cadre = true;
    this.rendre();
  }

  versEcran(x, y) { return { X: x * this.s + this.tx, Y: y * this.s + this.ty }; }
  versPlan(X, Y) { return { x: (X - this.tx) / this.s, y: (Y - this.ty) / this.s }; }
  centre() { return this.versPlan(this.L / 2, this.H / 2); }

  borner(s) {
    const min = Math.min(this.L / (this.w || 1), this.H / (this.h || 1)) * 0.25;
    return Math.max(min, Math.min(10, s));
  }

  centrerSur(x, y, s, decalY = 0) {
    if (s) this.s = this.borner(s);
    this.tx = this.L / 2 - x * this.s;
    this.ty = this.H / 2 + decalY - y * this.s;
    this.rendre();
  }

  zoomer(f, X, Y) {
    const s2 = this.borner(this.s * f), k = s2 / this.s;
    this.tx = X - (X - this.tx) * k;
    this.ty = Y - (Y - this.ty) * k;
    this.s = s2;
    this.rendre();
  }

  zoomerAnime(f, X, Y) {
    const s0 = this.s, tx0 = this.tx, ty0 = this.ty, s1 = this.borner(s0 * f), k = s1 / s0;
    const tx1 = X - (X - tx0) * k, ty1 = Y - (Y - ty0) * k, t0 = performance.now();
    const pas = (t) => {
      const a = Math.min(1, (t - t0) / 180), e = a * (2 - a);
      this.s = s0 + (s1 - s0) * e; this.tx = tx0 + (tx1 - tx0) * e; this.ty = ty0 + (ty1 - ty0) * e;
      this.rendre();
      if (a < 1) requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  }

  coord(e) {
    const r = this.c.getBoundingClientRect();
    return { X: e.clientX - r.left, Y: e.clientY - r.top };
  }

  bas(e) {
    try { this.c.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
    const p = this.coord(e);
    this.pointeurs.set(e.pointerId, p);
    this.enGeste = true;
    clearTimeout(this.minLong);
    if (this.pointeurs.size === 1) {
      this.geste = { type: 'un', X0: p.X, Y0: p.Y, bouge: false, tx0: this.tx, ty0: this.ty };
      if (this.mode === 'peindre' && e.button === 0) {
        this.geste.peinture = true;
        this.cb.peintureDebut?.(this.versPlan(p.X, p.Y));
      } else {
        this.minLong = setTimeout(() => {
          const g = this.geste;
          if (g && g.type === 'un' && !g.bouge && this.pointeurs.size === 1) {
            g.long = true;
            navigator.vibrate?.(15);
            this.cb.appuiLong?.(this.versPlan(p.X, p.Y), p);
          }
        }, 550);
      }
    } else if (this.pointeurs.size === 2) {
      if (this.geste?.peinture) this.cb.peintureAnnule?.();
      const [a, b] = [...this.pointeurs.values()];
      this.geste = {
        type: 'deux', d0: Math.max(10, Math.hypot(a.X - b.X, a.Y - b.Y)),
        m0: { X: (a.X + b.X) / 2, Y: (a.Y + b.Y) / 2 }, s0: this.s, tx0: this.tx, ty0: this.ty,
      };
    }
  }

  bouge(e) {
    if (!this.pointeurs.has(e.pointerId)) return;
    const p = this.coord(e);
    this.pointeurs.set(e.pointerId, p);
    const g = this.geste;
    if (!g) return;
    if (g.type === 'un') {
      const dX = p.X - g.X0, dY = p.Y - g.Y0;
      if (!g.bouge && Math.hypot(dX, dY) > 8) { g.bouge = true; clearTimeout(this.minLong); }
      if (g.peinture) { this.cb.peintureSuite?.(this.versPlan(p.X, p.Y)); return; }
      if (g.bouge && !g.long) { this.tx = g.tx0 + dX; this.ty = g.ty0 + dY; this.rendre(); }
    } else if (g.type === 'deux' && this.pointeurs.size >= 2) {
      const [a, b] = [...this.pointeurs.values()];
      const d = Math.hypot(a.X - b.X, a.Y - b.Y);
      const m = { X: (a.X + b.X) / 2, Y: (a.Y + b.Y) / 2 };
      const s2 = this.borner((g.s0 * d) / g.d0), k = s2 / g.s0;
      this.s = s2;
      this.tx = m.X - (g.m0.X - g.tx0) * k;
      this.ty = m.Y - (g.m0.Y - g.ty0) * k;
      this.rendre();
    }
  }

  haut(e, annule) {
    if (!this.pointeurs.has(e.pointerId)) return;
    this.pointeurs.delete(e.pointerId);
    clearTimeout(this.minLong);
    const g = this.geste;
    if (this.pointeurs.size === 0) { this.enGeste = false; this.rendre(); }
    if (!g) return;
    if (g.type === 'un') {
      if (g.peinture) {
        if (annule) this.cb.peintureAnnule?.(); else this.cb.peintureFin?.();
      } else if (!g.bouge && !g.long && !annule) {
        const p = this.coord(e), t = performance.now(), d = this.dernierTap;
        if (d && t - d.t < 300 && Math.hypot(p.X - d.X, p.Y - d.Y) < 30) {
          clearTimeout(this.minTap);
          this.dernierTap = null;
          this.zoomerAnime(2, p.X, p.Y);
        } else {
          this.dernierTap = { t, X: p.X, Y: p.Y };
          const pp = this.versPlan(p.X, p.Y);
          clearTimeout(this.minTap);
          this.minTap = setTimeout(() => this.cb.tape?.(pp, p), 250);
        }
      }
      this.geste = null;
    } else if (g.type === 'deux') {
      if (this.pointeurs.size === 1) {
        const [p] = [...this.pointeurs.values()];
        this.geste = { type: 'un', X0: p.X, Y0: p.Y, bouge: true, tx0: this.tx, ty0: this.ty };
      } else if (this.pointeurs.size === 0) this.geste = null;
    }
  }

  // Couche hors écran de la taille du canevas (pour les zones peintes semi-transparentes)
  couche() {
    const c = this._couche;
    if (c.width !== this.c.width || c.height !== this.c.height) { c.width = this.c.width; c.height = this.c.height; }
    return c;
  }

  rendre() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.peindre(); });
  }

  peindre() {
    const ctx = this.ctx, d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#E4E7E1';
    ctx.fillRect(0, 0, this.L, this.H);
    if (this.img) {
      ctx.save();
      ctx.translate(this.tx, this.ty);
      ctx.scale(this.s, this.s);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = this.enGeste ? 'low' : 'high';
      ctx.drawImage(this.img, 0, 0);
      ctx.lineWidth = 1 / this.s;
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.strokeRect(0, 0, this.w, this.h);
      ctx.restore();
    }
    this.dessiner?.(ctx, this);
    this.cb.vue?.();
  }
}
