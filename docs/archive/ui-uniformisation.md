# Mini charte UI

## Objectif
Uniformiser les pages autour d'un meme canevas:
- largeur de contenu unique: 1024px
- surfaces et bordures coherentes en clair/sombre
- marges et rayons harmonises

## Tokens globaux
Definis dans src/app/globals.css:
- --app-content-max-width: 64rem (1024px)
- --app-page-padding-x: 1rem
- --app-page-padding-y: 2rem
- --app-border: couleur de bordure selon theme
- --app-surface: fond principal de panneau
- --app-surface-muted: fond secondaire
- --app-panel-radius: 0.75rem
- --app-panel-shadow: ombre legere selon theme

## Regles de layout
1. Conteneurs centraux
- main.mx-auto et div.mx-auto utilisent une largeur max unique de 1024px.

2. Surface de page
- main et .app-page-surface partagent le meme fond pilote par theme.

3. Panneaux
- Les blocs arrondis avec bordure dans les zones principales suivent la meme couleur de bordure.
- Les elements en shadow-sm utilisent une ombre normalisee.

## Classes utilitaires recommandees
- .app-container: conteneur central 1024px
- .app-main: padding horizontal/vertical standard
- .app-panel: panneau principal (fond, bordure, rayon, ombre)
- .app-panel-muted: panneau secondaire

## Marges et rythme
- Espacement vertical principal recommande: py-8
- Espacement entre blocs: gap-4 a gap-6
- Eviter les melanges py-6/py-10 sans raison de contexte (auth card, etat vide, etc.)

## Good practices
- Preferer les tokens/variables aux couleurs hardcodees.
- Pour les nouvelles pages, partir de .app-container + .app-main.
- Pour les cartes: .app-panel ou .app-panel-muted avant ajout de styles specifiques.

## Verification rapide
- En theme clair: fond principal, panneaux blancs, bordures grises legeres.
- En theme sombre: fond principal sombre, panneaux slate, bordures slate coherentes.
- Verifier que le contenu reste centre et borne a 1024px sur desktop.
