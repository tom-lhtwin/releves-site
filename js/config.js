// Catégories, niveaux de confiance et couleurs partagés

export const CATEGORIES = {
  equipement: { nom: 'Équipement électrique', court: 'Équipement', couleur: '#C2410C', lettre: 'É' },
  plaque: { nom: 'Plaque signalétique', court: 'Plaque', couleur: '#6741D9', lettre: 'P' },
  acces: { nom: 'Accès / danger', court: 'Accès', couleur: '#C92A2A', lettre: '!' },
  remarque: { nom: 'Remarque', court: 'Remarque', couleur: '#1864AB', lettre: 'R' },
  photo: { nom: 'Photo', court: 'Photo', couleur: '#4B5563', lettre: '•' },
};

export const CONFIANCE = {
  bonne: { libelle: 'Bonne', couleur: '#0E6E5C', rang: 3 },
  moyenne: { libelle: 'Moyenne', couleur: '#C2410C', rang: 2 },
  faible: { libelle: 'Faible', couleur: '#B42318', rang: 1 },
  aucune: { libelle: 'Sans position', couleur: '#6B7280', rang: 0 },
};

export const PEINTURE = {
  prevu: { nom: 'Prévu', couleur: '#F2C200', alpha: 0.46 },
  fait: { nom: 'Fait', couleur: '#1F9D55', alpha: 0.52 },
  perimetre: { nom: 'Périmètre', couleur: '#2B6CB0', alpha: 0.16 },
};

export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
