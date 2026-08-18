# Arborescence de navigation — Refonte UI

Cartographie complète des pages du site, organisée par parcours utilisateur. Sert de base à la refonte complète de la charte graphique ("fonte"/police + thème visuel).

Source de vérité actuelle : [`src/lib/nav-permissions-registry.ts`](../src/lib/nav-permissions-registry.ts) (labels, rôles requis, hrefs) + arborescence réelle des fichiers `src/app/**/page.tsx`.

Légende rôle : **Tous** · **Membre** · **Admin** · **Owner** · **SuperUser** · *(caché par défaut)*

---

## 1. Pages transverses (hors contexte clan/membre)

| Page | Route | Rôle |
|---|---|---|
| Accueil / redirection | `/` | Tous |
| Liste des clans | `/clans` | Tous |
| Ligue (classement public de tous les clans) | `/clans-leaderboard` | Tous |
| Comparateur de clans | `/clans/comparator` | Tous |
| Mon compte | `/account` | Membre |
| Connexion | `/login` | — |
| Activation SuperUser | `/activate` | — |
| Réinitialisation mot de passe | `/reset-password` | — |
| Rejoindre un clan | `/join` | — |

---

## 2. Espace Clan — `/clans/[clanId]/...`

Navigation contextuelle "Mon clan" (`ClanSectionNav`).

```
/clans/[clanId]/
├── overview                          Vue d'ensemble ............... Admin
├── members                           Membres ........................ Admin
│   └── pending                       Demandes en attente ............ Admin
├── matches                           Matchs .......................... Tous
│   ├── [matchId]/telemetry           Détail télémétrie d'un match .... Tous
│   └── session/[date]                Session de matchs (par date) .... Tous
├── stats                             Stats agrégées .................. Tous
│   ├── weapons                       Stats armes ..................... Owner
│   │   └── categories                Catégories d'armes .............. Owner
│   ├── heatmap-kills                 Heatmap des kills ............... Owner
│   └── positions                     Cartographie tactique ........... Owner
├── drop-zones                        Drop zones ....................... Owner
├── awards                            Awards / distinctions ........... Tous
├── leaderboard                       Classement des membres .......... Tous
├── challenges                        Challenges ....................... Tous
│   └── [challengeId]                 Détail d'un challenge ........... Tous
├── reports                           Rapports (hebdo/mensuel) ........ Tous
│   └── [reportId]                    Détail d'un rapport ............. Tous
├── settings/
│   ├── members                       Joueurs et rôles ................ Admin
│   └── login-welcome                 Accueil login (branding clan) ... Admin
└── telemetry/                        (Owner) — monitoring pipeline
    ├── dashboard                     Dashboard télémétrie ............ Owner
    ├── errors                        Erreurs télémétrie .............. Owner
    ├── sync-batch-manual             Sync batch manuel ............... Owner
    ├── recoveries                    Recoveries télémétrie ........... Owner
    ├── matches                       Télémétrie matchs (liste jobs) .. Owner
    │   ├── [matchId]/telemetry       Détail télémétrie ............... Owner
    │   └── session/[date]            Session (par date) .............. Owner
    └── opponents                     Adversaires rencontrés .......... Owner
```

**Ordre recommandé pour la nav "Mon clan"** (fréquence d'usage décroissante) :
Vue d'ensemble → Membres → Matchs → Stats → Classement → Awards → Challenges → Rapports → Drop zones/Heatmap/Cartographie (Owner) → Settings (Admin) → Télémétrie (Owner).

---

## 3. Espace Membre / Joueur — `/members/[id]/...`

Navigation contextuelle "Mon profil" (`ClanSectionNav` équivalent membre).

```
/members/
├── (liste)                           Liste des membres ............... Tous
├── add                                Ajouter un joueur ............... Admin
├── manage                             Gestion des joueurs ............. Admin
└── [id]/
    ├── dashboard                      Tableau de bord .................. Tous
    ├── stats                          Stats globales ................... Tous
    ├── weapons                        Armes ............................. Tous
    ├── matches                        Historique des matchs ............ Tous
    ├── nemesis                        Némésis ........................... Tous
    ├── map-stats                      Cartes ............................ Tous
    ├── drop-zones                     Drop zones ........................ Tous
    ├── heatmap                        Calendrier d'activité ............. Tous
    ├── rewards                        Récompenses ........................ Tous
    ├── notifications                  Notifications ...................... Tous
    └── notification-preferences       Préférences de notifications ....... Tous
```

**Ordre recommandé pour la nav "Mon profil"** :
Tableau de bord → Stats globales → Armes → Matchs → Cartes → Némésis → Drop zones → Calendrier → Récompenses → Notifications → Préférences notifs.

---

## 4. Menu Admin (sidebar, section `admin-menu`)

| Page | Route | Portée |
|---|---|---|
| Ajouter un joueur | `/members/add` | Global |
| Joueurs et rôles | `/clans/[clanId]/settings/members` | Par clan |
| Alias cartes PUBG | `/settings/map-labels` | Global |
| Alias armes PUBG | `/settings/weapon-labels` | Global |
| Alias catégories armes | `/settings/weapon-categories` | Global |
| Alias phases PUBG | `/settings/phase-labels` | Global |
| Accueil login (branding) | `/clans/[clanId]/settings/login-welcome` | Par clan |

## 5. Menu Owner (sidebar, section `owner-menu`)

| Page | Route |
|---|---|
| Dashboard télémétrie | `/clans/[clanId]/telemetry/dashboard` |
| Erreurs télémétrie | `/clans/[clanId]/telemetry/errors` |
| Sync batch manuel | `/clans/[clanId]/telemetry/sync-batch-manual` |
| Recoveries télémétrie | `/clans/[clanId]/telemetry/recoveries` |
| Télémétrie matchs | `/clans/[clanId]/telemetry/matches` |
| Adversaires rencontrés | `/clans/[clanId]/telemetry/opponents` |
| Test email | `/settings/email-delivery` |
| Monitoring PUBG API | `/settings/pubg-api` |
| Permissions nav | `/settings/nav-permissions` |
| Changer de clan | `/clans` |

## 6. Menu SuperUser (sidebar, section `superuser-menu`)

| Page | Route |
|---|---|
| Ops Cron | `/settings/cron` |
| Tous les clans (switch) | `/clans` |
| Config plateforme | `/settings/nav-permissions` |
| Télémétrie cross-clans | `/settings/telemetry-recoveries` |
| Adversaires (vue transverse) | `/settings/opponents` |
| Import de matchs PUBG | `/settings/match-import` |

---

## 5 groupes de "familles" de gabarits pour la refonte de fonte

Utile pour scoper le travail de refonte visuelle par type de page plutôt que par route individuelle :

1. **Pages liste/tableau** — `/clans`, `/members`, `clan.members`, `clan.leaderboard`, `clan.reports`, `clan.challenges`, settings admin (labels/alias)
2. **Pages dashboard/stats à cartes & graphiques** — `member.dashboard`, `member.stats`, `member.weapons`, `clan.stats*`, `owner.telemetry-dashboard`
3. **Pages détail** — `[matchId]/telemetry`, `[reportId]`, `[challengeId]`, `member.matches`
4. **Pages carto/heatmap** (canvas/SVG interactif) — `clan.heatmap-kills`, `clan.positions`, `clan.drop-zones`, `member.map-stats`, `member.drop-zones`
5. **Pages formulaire/settings** — `members/add`, `settings/*`, `clans/[clanId]/settings/*`

---

*Fichier généré depuis l'état du code au 2026-08-18. À tenir à jour si de nouvelles routes sont ajoutées.*
