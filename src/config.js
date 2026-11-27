// =============================================================
//  TOUT CE QUI EST PERSONNALISABLE EST ICI
// =============================================================

// --- Lieux (lat, lon) ---
export const PLACES = {
  toulouse: { lat: 43.6293, lon: 1.3638, label: 'TOULOUSE' }, // aéroport Toulouse-Blagnac
  bruxelles: { lat: 50.9014, lon: 4.4844, label: 'BRUXELLES' }, // Brussels Airport (Zaventem)
  malines: { lat: 51.0177, lon: 4.4828, label: 'MALINES' }, // gare de Mechelen (passage du train)
  anvers: { lat: 51.2172, lon: 4.4211, label: 'ANVERS' }, // Antwerpen-Centraal
  atomium: { lat: 50.8949, lon: 4.3415 },
  cathedrale: { lat: 51.2203, lon: 4.4015 },
  thunderdome: { lat: 51.2305, lon: 4.4423 }, // AFAS Dome, Anvers (soirée CHAOS)
  hotel: { lat: 51.2141, lon: 4.4283, label: 'LINDNER HOTEL' }, // Lindner Hotel Antwerp
  zoo: { lat: 51.2168, lon: 4.4237, label: 'ZOO D’ANVERS' },
  // lieux des activités (repères lumineux sur la carte)
  grandplace: { lat: 50.8467, lon: 4.3525, label: 'GRAND-PLACE' },
  galeries: { lat: 50.8478, lon: 4.3548, label: 'GALERIES SAINT-HUBERT' },
  resto: { lat: 51.2195, lon: 4.4035, label: 'CENTRE D’ANVERS' },
  brunch: { lat: 51.2152, lon: 4.4215, label: 'BRUNCH' },
  meir: { lat: 51.2183, lon: 4.409, label: 'LE MEIR' },
  grotemarkt: { lat: 51.2213, lon: 4.3997, label: 'GROTE MARKT' },
  diamants: { lat: 51.216, lon: 4.419, label: 'QUARTIER DES DIAMANTS' },
};

// --- Textes ---
export const TEXTS = {
  giftHint: 'Mets le son et clique',
  // (un "…" au début = italique ; le dernier texte part avec un souffle)
  intro: [
    'Joyeux anniversaire ❤️',
    'Cette année, je voulais t’offrir un cadeau un peu particulier…',
    '…mais rien de matériel.',
    'Plutôt des souvenirs.',
    'Un week-end, là où tout a commencé.',
    'Alors fais ta valise.',
    'On part.',
  ],

  // cartes des jours (PAS de date : rien ne doit faire penser au 12 décembre)
  vendredi: { day: 'Jour 1', date: 'Vendredi', line: 'Toulouse → Bruxelles' },
  nuit: 'Nuit à l’aéroport',
  samedi: { day: 'Jour 2', date: 'Samedi', line: 'Bruxelles → Anvers' },
  dimanche: { day: 'Jour 3', date: 'Dimanche', line: 'Le zoo d’Anvers' },
  lundi: { day: 'Jour 4', date: 'Lundi', line: 'Retour à la maison' },
  // après le récap en liste (le dernier texte s'affiche en jaune juste avant le trou)
  manque: ['Le week-end parfait.', 'Enfin… presque.', 'C’est pas un simple repas…'],
  // textes de l'action (elle tape n'importe où) : au départ, après les 1ers taps, puis selon la vitesse
  tapHints: ['Appuie', 'Encore', 'Plus vite', 'PLUS VITE !!'],
  reveal: {
    date: 'SAMEDI 12.12.2026',
    places: '2 PLACES',
    nous: 'TOI & MOI',
  },
  fin: 'Joyeux anniversaire mon cœur ❤️',
  replay: 'Revoir ↺',
};

// --- Activités qui surgissent en bulles au-dessus de la carte (le week-end a l'air bien rempli…) ---
// --- Le programme, jour par jour (panneau en bas de l'écran pendant le voyage) ---
// place = clé de PLACES : la caméra y va et un repère lumineux sort de la carte. stars = étoiles d'hôtel.
// ⚠️ le samedi soir doit avoir l'air d'une soirée banale : c'est le leurre.
export const PROGRAMME = {
  vendredi: {
    title: 'JOUR 1',
    day: 'Vendredi',
    items: [
      { when: 'Soir', what: 'Vol Toulouse → Bruxelles' },
      { when: 'Nuit', what: 'Hôtel à 5 min de l’aéroport', place: 'bruxelles' },
    ],
  },
  samedi: {
    title: 'JOUR 2',
    day: 'Samedi',
    items: [
      { when: 'Matin', what: 'Balade dans Bruxelles', place: 'galeries' },
      { when: 'Midi', what: 'Frites sur la Grand-Place', place: 'grandplace' },
      { when: 'Début d’aprèm', what: 'L’Atomium', place: 'atomium' },
      { when: 'Après-midi', what: 'Train pour Anvers', train: true },
      { when: 'Fin d’aprèm', what: 'Check-in au Lindner Hotel', stars: 4, place: 'hotel' },
      { when: 'Soir', what: 'Petit resto en amoureux', place: 'resto' },
    ],
  },
  dimanche: {
    title: 'JOUR 3',
    day: 'Dimanche',
    items: [
      { when: 'Matin', what: 'Brunch', place: 'brunch' },
      { when: 'Journée', what: 'Le zoo d’Anvers', place: 'zoo', big: true },
      { when: 'Fin d’aprèm', what: 'Spa à l’hôtel', place: 'hotel' },
      { when: 'Soir', what: 'Bières belges sur le Grote Markt', place: 'grotemarkt' },
    ],
  },
  lundi: {
    title: 'JOUR 4',
    day: 'Lundi',
    items: [
      { when: 'Matin', what: 'Le quartier des diamants', place: 'diamants' },
      { when: 'Après-midi', what: 'Train + vol retour', home: true },
      { when: 'Soir', what: 'À la maison, plein de souvenirs' },
    ],
  },
};

// --- Récap du voyage (acte 3), un jour par ligne. null = le créneau du samedi soir (le leurre) ---
export const TIMELINE = [
  { day: 'JOUR 1', num: 'Ven', items: ['Vol Toulouse → Bruxelles', 'Hôtel près de l’aéroport'] },
  { day: 'JOUR 2', num: 'Sam', items: ['Bruxelles, puis Anvers', null] },
  { day: 'JOUR 3', num: 'Dim', items: ['Le zoo d’Anvers', 'Bières sur le Grote Markt'] },
  { day: 'JOUR 4', num: 'Lun', items: ['Retour à Toulouse', 'Plein de souvenirs'] },
];
// le samedi soir : affiché comme une soirée banale (decoy), puis au moment du twist il bugue et se réécrit (text)
export const HOLE_TEXT = { label: 'SAMEDI SOIR', decoy: 'Petit resto en amoureux', text: 'Repas gourmet chez T' };

// --- Musique du reveal (optionnelle) ---
// Dépose un mp3 dans public/audio/drop.mp3 et règle `dropAt` (en secondes, l'instant du drop
// dans le morceau). Sans fichier, un kick gabber est généré en live.
export const MUSIC = {
  src: 'audio/drop.mp3',
  dropAt: 0,
  bpm: 190,
};
