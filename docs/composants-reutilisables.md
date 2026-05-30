# Composants reutilisables

Ce document centralise les composants reutilisables de l application, leur intention, leurs points d extension et les usages actuels.

## Objectif

- Eviter la duplication de logique UI.
- Garder une apparence coherente entre pages.
- Faire reposer les variations visuelles sur le theme global.

## Composants UI standards

| Composant | Fichier | Role | Usages actuels |
| --- | --- | --- | --- |
| SegmentedControl | src/components/ui/SegmentedControl.tsx | Groupe de boutons segmentes pour filtres/periodes/onglets | dashboard PlayerStats, dashboard MatchHistory, dashboard ProgressionChart |
| PlacementBadge | src/components/ui/PlacementBadge.tsx | Badge de classement joueur avec paliers de placement | dashboard MatchHistory, SquadMatchList, members dashboard (top performances), members matches (imports), TopPerformers |
| TeamModeBadge | src/components/ui/TeamModeBadge.tsx | Badge mode equipe Duo/Trio/Squad avec icone standard | clans matches, SquadMatchList, SquadSynergies, SessionRecap, members map-stats |
| MobileDropdownNav | src/components/ui/MobileDropdownNav.tsx | Menu dropdown mobile pour filtres/navigation en petit ecran | MemberSectionNav, members notifications, members heatmap, members map-stats |

## Details par composant

### SegmentedControl

Fichier: src/components/ui/SegmentedControl.tsx

Props principales:

- options: liste value/label
- value: valeur selectionnee
- onChange: callback de selection
- size: xs ou sm
- wrap: autoriser le retour a la ligne
- fullWidthOnMobile: pleine largeur sur mobile
- className: extension locale

Contrat visuel:

- S appuie sur les classes theme app-segmented-control et app-segmented-control__item
- Etat actif: app-segmented-control__item--active
- Respect des arrondis externes du cadre sur le premier et dernier item

### PlacementBadge

Fichier: src/components/ui/PlacementBadge.tsx

Props principales:

- placement: valeur numerique du classement
- label: surcharge optionnelle du texte affiche (exemple #2.40)
- className: extension locale

Logique de paliers:

- 1: winner
- 2 a 5: top5
- 6 a 10: top10
- 11 et plus: default

Contrat visuel:

- S appuie sur les classes theme app-placement-badge, app-placement-badge--winner, app-placement-badge--top5, app-placement-badge--top10, app-placement-badge--default
- Variantes claire et sombre definies dans src/app/globals.css

### TeamModeBadge

Fichier: src/components/ui/TeamModeBadge.tsx

Props principales:

- mode: duo, trio, squad
- label: surcharge optionnelle du texte
- size: xs ou sm
- className: extension locale

Helpers exposes:

- teamModeFromMemberCount(memberCount): derive duo/trio/squad depuis la taille d equipe

Contrat visuel:

- S appuie sur les classes theme app-team-mode-badge et ses variantes
- Icones standard sous public/icons/squads

### MobileDropdownNav

Fichier: src/components/ui/MobileDropdownNav.tsx

Props principales:

- id, label, currentLabel
- items: liste d actions/liens avec etat actif
- leftIcon
- variant
- visibilityClass
- className

Comportement:

- Ferme au clic exterieur
- Ferme sur touche Escape
- Ferme apres selection

## Theme global associe

Les styles des composants reutilisables sont centralises dans:

- src/app/globals.css

Familles de classes deja en place:

- app-segmented-control*
- app-placement-badge*
- app-team-mode-badge*
- app-pagination*
- app-table*

## Regles de contribution

Pour toute nouvelle UI reutilisable:

1. Creer le composant dans src/components/ui.
2. Brancher le style principal sur des classes theme dans src/app/globals.css.
3. Eviter les couleurs hardcodees dans les pages; preferer les classes standard.
4. Migrer les occurrences dupliquees vers le composant partage.
5. Verifier rendu desktop, tablette et mobile.

## Checklist de verification

- Le composant fonctionne en theme clair et sombre.
- Les etats hover/active/disabled sont lisibles.
- Le rendu mobile ne casse pas la mise en page.
- Les classes theme sont reutilisables sans patch local.
- L accessibilite minimale est couverte (aria-label, focus, navigation clavier selon le cas).
