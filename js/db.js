// Accès IndexedDB minimal : trois magasins.
//  - elements : tous les enregistrements synchronisables (projet, épingle, station, trait, calage)
//  - fichiers : photos et plans (blobs), immuables
//  - meta     : réglages propres à ce téléphone (identifiant d'appareil, opérateur, curseurs…)

const NOM = 'lh-releves-site';
const VERSION = 1;
let ouverture;

function ouvrir() {
  if (!ouverture) {
    ouverture = new Promise((res, rej) => {
      const r = indexedDB.open(NOM, VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        const e = d.createObjectStore('elements', { keyPath: 'id' });
        e.createIndex('projet', 'projet');
        e.createIndex('type', 'type');
        e.createIndex('aEnvoyer', '_aEnvoyer');
        const f = d.createObjectStore('fichiers', { keyPath: 'id' });
        f.createIndex('projet', 'projet');
        f.createIndex('aEnvoyer', '_aEnvoyer');
        d.createObjectStore('meta', { keyPath: 'cle' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('Base bloquée : fermez les autres onglets de l\'application'));
    });
  }
  return ouverture;
}

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const fin = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

export async function get(magasin, cle) {
  const d = await ouvrir();
  return req(d.transaction(magasin).objectStore(magasin).get(cle));
}
export async function getMany(magasin, cles) {
  const d = await ouvrir();
  const s = d.transaction(magasin).objectStore(magasin);
  return Promise.all(cles.map((c) => req(s.get(c))));
}
export async function put(magasin, valeur) {
  const d = await ouvrir();
  const t = d.transaction(magasin, 'readwrite');
  t.objectStore(magasin).put(valeur);
  return fin(t);
}
export async function putMany(magasin, valeurs) {
  if (!valeurs.length) return;
  const d = await ouvrir();
  const t = d.transaction(magasin, 'readwrite');
  const s = t.objectStore(magasin);
  for (const v of valeurs) s.put(v);
  return fin(t);
}
export async function supprimer(magasin, cle) {
  const d = await ouvrir();
  const t = d.transaction(magasin, 'readwrite');
  t.objectStore(magasin).delete(cle);
  return fin(t);
}
export async function parIndex(magasin, index, valeur) {
  const d = await ouvrir();
  return req(d.transaction(magasin).objectStore(magasin).index(index).getAll(IDBKeyRange.only(valeur)));
}
export async function clesParIndex(magasin, index, valeur) {
  const d = await ouvrir();
  return req(d.transaction(magasin).objectStore(magasin).index(index).getAllKeys(IDBKeyRange.only(valeur)));
}
export async function existe(magasin, cle) {
  const d = await ouvrir();
  return (await req(d.transaction(magasin).objectStore(magasin).count(cle))) > 0;
}
