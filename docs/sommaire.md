# Sommaire docs

Cette page centralise la documentation du projet sur une seule vue.

## Vue rapide

- Classement clan: calcul live, filtres, badges, progression
- Matchs clan: agrégations sessions, synergies, top performers
- Tableaux du site: inventaire complet des vues tabulaires
- Composants UI: composants réutilisables et conventions
- Uniformisation UI: charte visuelle globale

## Index par document

- [Calcul leaderboard](leaderboard-calcul.md)
  - Source des données, période, tri, K/M, distinctions, progression, all time
- [Calcul matchs clan](matchs-clan-calcul.md)
  - Méthodes de calcul de /clans/[clanId]/matches, sessions, synergies, performers
- [Inventaire des tableaux](tableaux-site.md)
  - Où sont les tableaux, contrôles disponibles, état de centralisation
- [Composants réutilisables](composants-reutilisables.md)
  - Composants UI partagés, usages et contrats visuels
- [Uniformisation UI](ui-uniformisation.md)
  - Tokens, layout, panneaux, bonnes pratiques
- [Showcase composants](composants-showcase.html)
  - Démo visuelle des composants et styles

## Parcours recommandé

1. Comprendre le classement: commencer par [Calcul leaderboard](leaderboard-calcul.md)
2. Comprendre la page Matchs: lire [Calcul matchs clan](matchs-clan-calcul.md)
3. Vérifier les patterns UI: passer par [Composants réutilisables](composants-reutilisables.md)
4. Vérifier la cohérence visuelle: lire [Uniformisation UI](ui-uniformisation.md)

## Notes

- Les docs de calcul décrivent le comportement réel du code actuel.
- En cas d'évolution métier, mettre à jour en priorité:
  - leaderboard-calcul.md
  - matchs-clan-calcul.md
