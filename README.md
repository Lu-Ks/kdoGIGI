# 🎁 Surprise Thunderdome

## Lancer
```bash
npm install
npm run dev          # http://localhost:5173  (+ URL réseau pour tester sur iPhone, même wifi)
npm run build        # site statique dans dist/
```

## Personnaliser
Tout est dans `src/config.js` : textes, lieux (lat/lon), timeline, musique.

- **Musique du drop** : dépose `public/audio/drop.mp3` et règle `MUSIC.dropAt` (seconde du drop dans le morceau) + `MUSIC.bpm`. Sans fichier → kick gabber généré.
- **Logo** : `public/logo.svg`.

## Debug
- `?act=1|2|3|4` : démarrer directement à un acte (un tap reste nécessaire pour l'audio).
- `?speed=2` : tout en accéléré.
- `/phone.html?act=2` : aperçu au format iPhone (390×844) dans un navigateur desktop.

## Données géo
`npm run geo` régénère `public/geo/geo.json` depuis `data-raw/` (Natural Earth, domaine public).
`data-raw/` (~33 Mo) n'est pas nécessaire au site et peut être supprimé.
