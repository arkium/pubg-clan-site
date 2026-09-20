# Analyse de Conformité Légale & Conditions d'Utilisation (PUBG / KRAFTON)

> **Document analysé :** [Règles de Conduite PUBG: BATTLEGROUNDS (Steam)](https://pubg.com/fr/clause/rules_of_conduct/label_steam/latest)  
> **Texte complémentaire de référence :** [PUBG Developer API Terms of Use](https://developer.pubg.com/tos)  
> **Date d'analyse :** 20 Septembre 2026  
> **Projet concerné :** `pubg-clan-site` / `frenchchicken.gg`  
> **Statut global :** **CONFORME / RISQUE NUL DE BANNISSEMENT** (sous réserve des bonnes pratiques listées ci-dessous).

---

## 1. Contexte et Périmètre Juridique

Le document visé par KRAFTON (*Rules of Conduct*) régit principalement le comportement des **joueurs finaux au sein du jeu et autour du client Steam** (anti-triche, exploitation de failles, comportements toxiques, gestion des clans *in-game*).

Pour une application web tierce comme ce projet (plateforme SaaS / portail communautaire pour les clans), la relation avec l'éditeur KRAFTON est régie par deux niveaux :
1. **Le Code de Conduite PUBG (Steam)** : S'assurer que le service n'encourage, ne facilite ni ne constitue une violation des règles de jeu pour les joueurs.
2. **Les Conditions d'Utilisation de l'API Développeur (PUBG Developer API)** : Le cadre contractuel accordant le droit de récupérer et d'afficher les données de match, les classements et la télémétrie.

---

## 2. Analyse Détaillée des Risques face au Code de Conduite

| Article du Code de Conduite | Exigences KRAFTON | Implémentation dans le Projet | Niveau de Risque |
| :--- | :--- | :--- | :---: |
| **Art. 5.1 — Programmes et appareils non autorisés** | Interdiction des cheats, macros, cartes DMA ou programmes tiers conférant un avantage déloyal en jeu. | Le projet est un site web hébergé sur serveur (Next.js / Node / MySQL). Aucun exécutable ne tourne sur la machine du joueur, aucune mémoire de processus n'est lue. | **NUL** |
| **Art. 5.2 — Modification du client, serveurs ou données** | Interdiction formelle de modifier les fichiers de jeu (`.ini`, DLLs) ou d'intercepter les paquets réseau (*packet sniffing / MITM*). | Aucune modification locale ni interception réseau. Les données proviennent exclusivement des serveurs officiels `api.pubg.com` via HTTPS. | **NUL** |
| **Télémétrie & Replay de match** | Interdiction de divulguer des données de partie en direct (radars en temps réel / stream sniping assisté). | La télémétrie n'est téléchargée et traitée qu'**a posteriori** (post-match), via les URL publiques S3/CDN fournies officiellement par l'API KRAFTON une fois la partie terminée. | **NUL** |
| **Art. 5.12 — Manipulation des résultats & Boost** | Interdiction d'arranger des parties ou d'automatiser des gains indus d'EXP ou d'objets. | Le site se limite à de la visualisation analytique, des graphiques et des bilans de performance post-partie. | **NUL** |
| **Art. 4.5 — Génération de bénéfices sans autorisation** | Interdiction de monétiser les services du jeu sans accord préalable. | L'accès au portail et aux statistiques de clan est communautaire et gratuit (clé API Développeur standard). *(Voir section Monétisation ci-dessous).* | **CONFORME** |
| **Art. 11 — Politique de fonctionnement des Clans** | Règles sur le nommage, la non-usurpation et l'interdiction de vendre ou échanger des clans dans le jeu. | Le site propose un hub externe d'organisation pour les clans officiels existants. Il n'intervient pas dans la vente de clans ni dans le système d'argent ou d'EXP *in-game*. | **CONFORME** |

---

## 3. Conformité avec l'API Développeur KRAFTON (PUBG Developer Terms)

Le projet utilise l'API publique officielle via un jeton d'authentification (`PUBG_API_KEY`). Pour conserver cette clé active et éviter toute révocation, les points suivants doivent être respectés :

### A. Non-Monétisation et Gratuité
* **Règle :** Une clé API publique / gratuite ne permet pas d'établir un paywall direct sur les données de l'API (ex: faire payer un abonnement pour voir ses statistiques PUBG).
* **Application :** Le service doit demeurer accessible gratuitement pour les membres et les clans. Si une formule payante devait voir le jour à terme, une demande formelle d'accès API "Commercial" devra être formulée auprès de KRAFTON.

### B. Respect des Quotas (Rate Limiting & Throttling)
* **Règle :** Tout abus de requêtes surchargeant les serveurs de KRAFTON peut entraîner le bannissement temporaire ou définitif de l'adresse IP et de la clé API.
* **Application :** Le projet respecte scrupuleusement cette contrainte grâce à sa file d'attente throttlée centralisée (`src/lib/api-throttle.ts`) et son système de cache en base MySQL (réduction drastique des appels redondants).

### C. Protection de la Marque (Branding & Trademark)
* **Règle :** KRAFTON interdit d'induire les utilisateurs en erreur en laissant croire que l'outil est un service officiel.
* **Point fort :** Le choix de domaines comme `frenchchicken.gg` ou de sous-domaines par clan évite d'incorporer directement la marque « PUBG » dans l'URL principale (contrairement à des domaines litigieux du type `pubg-france.com`).

---

## 4. Recommandations et Actions à Mettre en Place

Pour que le projet soit irréprochable sur les plans légal, contractuel et RGPD, les actions suivantes sont recommandées :

### 1. Mentions Légales et Disclaimer d'Affiliation (Obligatoire)
Ajouter dans le footer général du site (dans `src/app/layout.tsx`) la mention d'usage légal :
```html
<p className="text-xs text-slate-500">
  PUBG: BATTLEGROUNDS est une marque déposée de KRAFTON, Inc. 
  Ce site est un projet communautaire non officiel et n'est ni affilié à, ni sponsorisé, ni approuvé par KRAFTON, Inc.
</p>
```

### 2. Respect de la Vie Privée et Déréférencement (RGPD / Art. 5.11)
* Bien que les pseudonymes (`IGN`) et les `account_id` soient des données publiques fournies par l'API du jeu, un joueur doit pouvoir demander à ce que son historique ou ses données personnelles soient masqués ou purgés de la base de données du site s'il en fait la demande formelle.
* Éviter de stocker ou d'associer des données réelles privées (noms civils, coordonnées bancaires, adresses IP des visiteurs) aux profils de jeu sans consentement explicite.

---

## Conclusion

Le projet s'inscrit pleinement dans le cadre légal prévu par l'éditeur pour les outils communautaires et les sites de statistiques tiers (similaire à des plateformes reconnues telles que *pubglookup* ou *dak.gg*). **Les joueurs et les administrateurs de clan n'encourent aucun risque de bannissement ou de sanction disciplinaire en utilisant cette plateforme.**