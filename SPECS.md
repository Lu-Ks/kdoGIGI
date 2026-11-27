# 🎁 Reveal Thunderdome — Spécifications

## 1. Contexte
- Cadeau d'anniversaire : 2 places pour **Thunderdome, samedi 12 décembre 2026**.
- Elle accède au site via un **QR code** imprimé (carte cadeau).
- Expérience **passive** : elle regarde, ne fait rien (hormis un tap initial). Durée cible : **~3 minutes**.
- Cible : **mobile en portrait** d'abord (iOS Safari + Android Chrome), desktop en bonus.

## 2. Le voyage (données réelles)
| Jour | Date | Trajet | Note |
|---|---|---|---|
| Vendredi | 11/12/2026 | Toulouse → Bruxelles | ✈️ avion · nuit à l'aéroport |
| Samedi | 12/12/2026 | Bruxelles → Anvers | 🚆 train · **THUNDERDOME** |
| Dimanche | 13/12/2026 | Anvers | chill hôtel / ville |
| Lundi | 14/12/2026 | Anvers → Bruxelles → Toulouse | 🚆 train puis ✈️ avion |

Appareil cible : **iPhone (Safari)** → pas de vibration, pas d'API plein écran, Wake Lock OK (iOS ≥ 16.4), audio débloqué par le tap initial, pas de gyroscope (évite un popup de permission).

## 3. Principe narratif
**Montée en intensité progressive** : sobre → voyage → touche belge → explosion gabber.
La destination « Thunderdome » est **cachée jusqu'à la fin** : le samedi soir est volontairement laissé en blanc pendant le récit, puis on y revient pour le big reveal.

## 4. Déroulé (timeline)

### Acte 0 — Le cadeau 🎁 (≈ attente)
- Fond noir, léger grain. Au centre, un **paquet cadeau 3D** qui flotte et tourne lentement, éclairé par une seule lumière douce (ruban satiné, papier sombre élégant).
- Petit texte pulsant : « Mets le son 🔊 et ouvre ton cadeau ».
- Pendant ce temps : pré-chargement de tous les assets (le cadeau n'est « ouvrable » qu'une fois tout chargé — sinon il frémit légèrement).
- **Au tap** : le cadeau tremble, le ruban se dénoue, le couvercle s'envole, un **faisceau de lumière** jaillit de la boîte, la caméra plonge dedans → fondu au noir → Acte 1.
- Ce tap sert aussi techniquement à : débloquer l'audio et activer le Wake Lock. Ensuite plus aucune interaction : tout s'enchaîne seul.

### Acte 1 — Sobre & mystérieux (≈ 40 s)
- Noir profond, typo élégante (serif fine), texte qui apparaît lettre par lettre / en fondu.
- Ambiance sonore : nappe grave, minimaliste.
- Textes (à finaliser) :
  1. « Joyeux anniversaire ❤️ »
  2. « Cette année, je voulais t'offrir quelque chose… »
  3. « …quelque chose d'inoubliable. »
  4. « Alors prépare-toi. »
  5. « On part. »

### Acte 2 — Le voyage (≈ 70 s)
- Apparition d'un **globe 3D nocturne** (lumières des villes), la caméra fonce sur **Toulouse**.
- Carte-titre : « Vendredi 11 décembre ».
- **Avion 3D** qui décolle, arc lumineux Toulouse → Bruxelles, caméra en suivi.
- Arrivée Bruxelles, carte « Nuit à l'aéroport 🌙 ».
- **Touche belge** qui monte : accents noir / jaune / rouge, silhouette de l'Atomium, puis de la cathédrale d'Anvers / des diamants d'Anvers.
- Carte « Samedi 12 décembre » → trajet Bruxelles → Anvers en vue drone inclinée, rapide.
- Arrivée Anvers : on saute volontairement le samedi soir.
- Carte « Dimanche : chill à Anvers ☕ ».
- Carte « Lundi » : train Anvers → Bruxelles, puis arc avion Bruxelles → Toulouse, « retour à la maison 🏠 ».

### Acte 3 — Le dézoom « timeline » + le trou (≈ 25 s)
- **Dézoom** : la caméra recule pour montrer tout le voyage d'un coup — le trajet complet tracé sur la carte (Toulouse → Bruxelles → Anvers → Toulouse).
- Une **timeline des 4 jours** se construit en 3D par-dessus (ruban flottant), créneau par créneau, avec icônes :
  `VEN ✈️ 🌙 | SAM 🚆 [ ??? ] | DIM ☕ | LUN 🏠`
  → on comprend la durée et le rythme du voyage.
- Tous les créneaux sont remplis… **sauf samedi soir** : un **trou noir** qui glitche, pulse en rouge, « ??? ».
- Texte : « Il manque quelque chose… »  « Samedi soir. »
- La musique s'arrête net. Silence. Battement de basse qui accélère (≈ 120 → 200 BPM).
- **La caméra fonce dans le trou** du samedi soir → plongée dans le noir → transition directe vers le reveal.

### Acte 4 — BIG REVEAL THUNDERDOME (≈ 40 s + boucle)
- **Drop** sur un morceau hardcore.
- Codes Thunderdome / gabber : noir + rouge, stroboscopes, glitch, camera shake calé sur le kick, typo massive industrielle.
- **Logo Thunderdome en 3D** (extrudé, métal sombre / rouge émissif, bloom) qui surgit et tourne.
- Texte : « THUNDERDOME — 12.12.2026 — 2 PLACES. TOI & MOI. »
- **2 billets 3D** qui tournent, particules / étincelles.
- Vibration du téléphone (Android ; non supporté sur iOS).
- Fin : boucle ambiance festival + petit mot final perso + bouton « Revoir ».

## 5. Direction artistique
| Phase | Palette | Typo | Son |
|---|---|---|---|
| Sobre | noir, blanc cassé, grain | serif fine | nappe ambient |
| Voyage | bleu nuit, lumières dorées | sans-serif légère | ambient + pulsation |
| Belge | + noir/jaune/rouge discrets | idem | montée |
| Thunderdome | noir, rouge sang, blanc strobe | industrielle / grasse | hardcore ~200 BPM |

## 6. Technique
- **Vite + Three.js** (scène unique pour la continuité globe → Belgique → reveal), **GSAP** pour la timeline.
- Globe : textures Terre nocturne + contours pays (GeoJSON Natural Earth) en lignes lumineuses → pas de clé API, 100 % local.
- Post-processing : bloom, glitch, chromatic aberration (pmndrs/postprocessing), allégé selon les perfs mobiles.
- Audio : Web Audio API, une piste par acte, synchronisée à la timeline.
- Perf : viser 60 fps sur un téléphone milieu de gamme, assets < ~15 Mo, niveau de qualité adaptatif.
- Pas d'interaction requise après le tap initial ; mode debug `?skip=acte` pour le développement.

## 7. Assets à fournir (par toi)
- [ ] Logo Thunderdome (SVG idéalement) → transformé en 3D (extrusion, métal, glow rouge). Placeholder en attendant.
- [ ] Morceau hardcore pour le reveal (mp3 + timestamp du drop) — à décider. Placeholder : kick gabber généré.
- [ ] Textes finaux (suspense + mot de fin)
- [ ] Photos (optionnel)

## 8. Questions ouvertes
- Hébergement : comment le QR code atteint le site (voir discussion).
- Transports exacts (avion / train / retour).
- Hôtels et lieu exact du Thunderdome (pour les placer sur la carte).
- Date de son anniversaire (deadline).
- Le modèle de son téléphone (iPhone ?).
