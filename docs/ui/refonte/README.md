# Paquet de passage — refonte UI (Classement comme page de référence)

Paquet préparé à partir de `arkium/pubg-clan-site@main` (1f70dd7) et des maquettes `Audit design.dc.html` (écrans 2b, 3a à 3d).

## Contenu

| Fichier | Où le copier dans le dépôt | Rôle |
|---|---|---|
| `docs/TODO/refonte-ui.md` | `docs/TODO/refonte-ui.md` | Spécification : décisions, règles, inventaire, phases, recette |
| `docs/ui/composants-refonte.md` | `docs/ui/composants-refonte.md` | Fiches des composants à créer, avec les valeurs exactes des maquettes |
| `CLAUDE.additions.md` | à fusionner dans `CLAUDE.md` | Règles à ajouter pour que Claude Code les applique à chaque demande |
| `ui-conformance.additions.ts` | à fusionner dans `src/lib/ui-conformance.test.ts` | Nouveaux contrôles statiques, avec leurs listes d'exceptions |
| `prompts.md` | (ne pas copier) | Demandes à coller dans Claude Code, phase par phase |
| `maquettes/Audit design.dc.html` | (ne pas copier) | Maquettes de référence, à ouvrir dans un navigateur |

## Démarche

1. Créez une branche `refonte-ui`.
2. Copiez les deux documents et fusionnez les ajouts au `CLAUDE.md`.
3. Dans VS Code, ouvrez Claude Code et collez la demande « Phase 0 » de `prompts.md`.
4. Relisez la PR : `npm run test`, `npm run test:e2e`, rendu clair/sombre à 375, 768 et 1280 px.
5. Enchaînez la page de référence (Classement), puis les phases 2 et 3, une demande par page.
6. À chaque phase, retirez les pages migrées des listes d'exceptions du test de conformité.
