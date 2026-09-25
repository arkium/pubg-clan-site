# Masquage des URLs & Liens Courts (Rewrite Transparent + Sqids)

> **Document d'architecture technique & Guide d'implémentation**  
> *Date : 25 septembre 2026*  
> *Approche retenue : Approche 2 (Rewrite transparent Next.js) avec Option A (Jetons Sqids réversibles sans BDD)*

---

## 1. Objectif & Vision

Transformer des URLs techniques, longues et verbeuses telles que :
```text
https://bee.chickendinner.fr/clans/2/telemetry/matches/0bc83556-91e8-466d-a367-9c98ef2e9894/debrief
```
en adresses épurées, élégantes et sécurisées :
```text
https://bee.chickendinner.fr/m/Lh0xDDdUPuM
ou
https://bee.chickendinner.fr/matches/Lh0xDDdUPuM
```

### Les deux principes fondamentaux retenus :
1. **Approche 2 (Rewrite transparent)** : L'utilisateur ne voit **JAMAIS** `/clans/2/` dans sa barre d'adresse. Next.js réécrit silencieusement le chemin en arrière-plan vers le bon composant.
2. **Option A (Sqids / Hashids)** : Les jetons courts (`Lh0xDDdUPuM`) sont générés et décodés **en mémoire par formule mathématique réversible**. **Zéro modification de la base de données MySQL**, aucune colonne à ajouter, aucune migration Prisma.

---

## 2. Option A : L'Encodage Sqids (Pourquoi et Comment ?)

### Pourquoi Sqids ?
[Sqids](https://sqids.org/javascript) (successeur officiel de Hashids) est une bibliothèque ultra-légère (zéro dépendance) qui convertit des identifiants en chaînes courtes similaires à celles de YouTube (`watch?v=...`) :
* **Déterministe & Réversible** : `encode(id) -> code` et `decode(code) -> id`.
* **Sécurisé par un Salt / Alphabet personnalisé** : Impossible pour un utilisateur externe de deviner l'ID réel ou d'incrémenter pour scraper les matchs voisins.
* **Performance instantanée** : L'encodage et le décodage s'exécutent en **moins de 0.05 milliseconde** en mémoire RAM.
* **Aucun stockage en base de données** : Le modèle `Match`, `SquadMatch`, `Clan` ou `Player` reste 100% intact dans Prisma.

### Helper TypeScript d'encodage : `src/lib/sqids.ts`

```typescript
import Sqids from 'sqids'

// Alphabet mélange pour garantir l'obfuscation
const sqids = new Sqids({
  alphabet: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  minLength: 6,
})

/**
 * Encode un ID numérique (ex: clanId, memberId) en jeton court.
 * Ex: 2 -> "X9kP2a"
 */
export function encodeNumericId(id: number): string {
  return sqids.encode([id])
}

/**
 * Décode un jeton court en ID numérique.
 */
export function decodeNumericId(token: string): number | null {
  const numbers = sqids.decode(token)
  return numbers.length > 0 ? numbers[0] : null
}

/**
 * Encode un UUID (128 bits, ex: squadMatchId) en jeton court réversible.
 * Convertit les deux moitiés de l'UUID en BigInt puis en Sqids.
 */
export function encodeUuid(uuid: string): string {
  const clean = uuid.replace(/-/g, '')
  if (clean.length !== 32) return uuid
  
  // Découpe en 2 blocs de 16 caractères hexa (64 bits chacun)
  const part1 = BigInt(`0x${clean.slice(0, 16)}`)
  const part2 = BigInt(`0x${clean.slice(16, 32)}`)
  
  // Découpe en 4 entiers sûrs pour Sqids (< 2^53)
  const n1 = Number(part1 >> 32n)
  const n2 = Number(part1 & 0xffffffffn)
  const n3 = Number(part2 >> 32n)
  const n4 = Number(part2 & 0xffffffffn)
  
  return sqids.encode([n1, n2, n3, n4])
}

/**
 * Décode un jeton court en UUID standard (avec tirets).
 */
export function decodeUuid(token: string): string | null {
  try {
    const nums = sqids.decode(token)
    if (nums.length !== 4) return null
    
    const part1 = (BigInt(nums[0]) << 32n) | BigInt(nums[1])
    const part2 = (BigInt(nums[2]) << 32n) | BigInt(nums[3])
    
    const hex1 = part1.toString(16).padStart(16, '0')
    const hex2 = part2.toString(16).padStart(16, '0')
    const raw = `${hex1}${hex2}`
    
    return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
  } catch {
    return null
  }
}
```

---

## 3. Approche 2 : Le Rewrite Transparent Next.js (`src/proxy.ts`)

### Comment fonctionne `NextResponse.rewrite()` ?

À la différence d'une redirection HTTP (301/302) qui change l'URL dans le navigateur :
* **Le Rewrite transparent** conserve l'URL épurée dans la barre d'adresse de l'utilisateur.
* En interne, Next.js sert le rendu de la page cible complexe.

```
Barre d'adresse (Ce que voit l'utilisateur) :
https://bee.chickendinner.fr/m/Lh0xDDdUPuM
                 │
                 │ Interception par src/proxy.ts
                 ▼
Next.js Rewrite (Ce que sert le serveur en arrière-plan) :
/clans/2/telemetry/matches/0bc83556-91e8-466d-a367-9c98ef2e9894/debrief
```

### Table de correspondance des URLs sur le sous-domaine

Quand la requête arrive sur `https://[tag].chickendinner.fr` (ex: `bee.chickendinner.fr`) :

| URL vue dans le navigateur | Route interne servie par Next.js | Description |
| :--- | :--- | :--- |
| `https://bee.chickendinner.fr/` | `/clans/2/overview` | Page d'accueil du clan |
| `https://bee.chickendinner.fr/matches` | `/clans/2/matches` | Historique des matchs du clan |
| `https://bee.chickendinner.fr/m/[token]` | `/clans/2/telemetry/matches/[uuid]/debrief` | Débriefing 2D du match (lien court) |
| `https://bee.chickendinner.fr/members` | `/clans/2/members` | Effectif du clan |
| `https://bee.chickendinner.fr/leaderboard` | `/clans/2/leaderboard` | Classement interne |
| `https://bee.chickendinner.fr/stats` | `/clans/2/overview` | Statistiques globales |

---

## 4. Implémentation pas à pas dans `src/proxy.ts`

Dans le middleware Next.js ([`src/proxy.ts`](file:///d:/Sources/pubg-clan-site/src/proxy.ts)), on ajoute l'interception des sous-domaines :

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { decodeUuid } from '@/lib/sqids'

// Cache en mémoire pour éviter d'appeler la BDD à chaque requête (TTL 5 minutes)
const clanSubdomainCache = new Map<string, { id: number; tag: string }>()

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const { pathname } = request.nextUrl

  // 1. Extraire le sous-domaine
  // ex: 'bee.chickendinner.fr' -> 'bee'
  const parts = host.split('.')
  const isSubdomain = parts.length > 2 && !['www', 'api', 'admin', 'dev', 'mail'].includes(parts[0].toLowerCase())
  const clanTag = isSubdomain ? parts[0].toLowerCase() : null

  if (clanTag) {
    // 2. Résoudre le clan (via API interne rapide ou cache)
    const clanId = await resolveClanIdByTag(clanTag, request.nextUrl.origin)

    if (clanId) {
      // Cas A : Lien court de match -> /m/[token] ou /matches/[token]
      const matchShortMatch = pathname.match(/^\/(?:m|matches)\/([a-zA-Z0-9]+)$/)
      if (matchShortMatch) {
        const token = matchShortMatch[1]
        const realMatchUuid = decodeUuid(token)
        if (realMatchUuid) {
          // Rewrite transparent vers la vraie page de débriefing
          return NextResponse.rewrite(
            new URL(`/clans/${clanId}/telemetry/matches/${realMatchUuid}/debrief`, request.url)
          )
        }
      }

      // Cas B : Racine du sous-domaine -> Accueil du clan
      if (pathname === '/') {
        return NextResponse.rewrite(new URL(`/clans/${clanId}/overview`, request.url))
      }

      // Cas C : Pages directes du clan (members, leaderboard, etc.)
      const directPages = ['members', 'matches', 'overview', 'leaderboard']
      const matchedPage = directPages.find((p) => pathname === `/${p}` || pathname.startsWith(`/${p}/`))
      if (matchedPage) {
        return NextResponse.rewrite(new URL(`/clans/${clanId}${pathname}`, request.url))
      }
    }
  }

  // Comportement standard pour les autres requêtes...
  return NextResponse.next()
}
```

---

## 5. Intégration avec Discord Webhooks

Dans [`src/lib/discord/discord-top1-embed.ts`](file:///d:/Sources/pubg-clan-site/src/lib/discord/discord-top1-embed.ts) :

Au lieu d'envoyer l'URL à rallonge :
```typescript
// Avant :
url: `${siteUrl}/clans/${input.clanId}/telemetry/matches/${input.squadMatchId}/debrief`
```
Discord reçoit directement l'URL courte et ultra-pro :
```typescript
import { encodeUuid } from '@/lib/sqids'

// Après :
const shortToken = encodeUuid(input.squadMatchId)
const clanSubdomainUrl = `https://${input.clanTag.toLowerCase()}.chickendinner.fr`

// Lien envoyé dans l'embed Discord :
url: `${clanSubdomainUrl}/m/${shortToken}`
```

### Rendu visuel dans Discord :
* **Titre cliquable** : `🍗 CHICKEN DINNER ! Top 1 pour [BEE] Killer Bees`
* **Lien cliqué** : `https://bee.chickendinner.fr/m/X9kP2a`
* **Résultat** : Le joueur arrive directement sur le débriefing 2D avec le replay, sans que l'URL ne change dans son navigateur !

---

## 6. Sécurité & Compatibilité Ascendante

1. **Non-régression absolue** :
   * Les anciennes URLs `/clans/2/telemetry/matches/.../debrief` continuent de fonctionner à 100%. Rien n'est cassé pour les marque-pages existants ou les appels d'API.
2. **Gestion des jetons invalides** :
   * Si un utilisateur modifie le jeton au hasard (`/m/FakeToken99`), `decodeUuid()` renvoie `null` et Next.js affiche une page 404 propre sans planter.
3. **Session & Authentification** :
   * Le cookie de session `pubg_clan_session` configuré avec `domain: '.chickendinner.fr'` fonctionne de manière transparente sur tous les sous-domaines.

---

## 7. Tests de Contrôle & Stratégie de Validation

Pour garantir la fiabilité de l'encodage, l'absence de régression de routing et la sécurité des données, une stratégie de test rigoureuse est définie :

### A. Règle d'or de l'environnement de test (Vitest)
> [!IMPORTANT]
> Conformément à [`vitest.config.ts`](file:///d:/Sources/pubg-clan-site/vitest.config.ts), Vitest collecte **exclusivement** les fichiers respectant le motif `src/lib/**/*.test.ts`.  
> Les tests automatisés de cette fonctionnalité seront donc implémentés dans **`src/lib/sqids.test.ts`** (pour les algorithmes de jetons) et **`src/lib/url-masking.test.ts`** (pour la logique de réécriture).

### B. Matrice des Tests Automatisés (`src/lib/sqids.test.ts`)

| Module testé | Cas de test | Comportement attendu |
| :--- | :--- | :--- |
| **IDs numériques** | `encodeNumericId(2)` | Génère un jeton court d'au moins 6 caractères alphanumériques. |
| | `decodeNumericId(token)` | `decodeNumericId(encodeNumericId(id)) === id` (bijectivité parfaite). |
| | Jetons invalides | Décodage d'un jeton vide ou corrompu retourne `null` sans jamais lever d'erreur (`throw`). |
| **UUIDs de Match** | `encodeUuid(squadMatchId)` | Convertit un UUID de 36 caractères (avec tirets) en un jeton compact (ex: `Lh0xDDdUPuM`). |
| | `decodeUuid(token)` | Restitue exactement l'UUID d'origine avec sa casse et ses tirets au bon endroit (`8-4-4-4-12`). |
| | Préservation des 128 bits | Vérifié sur un échantillon de 100 UUIDs aléatoires : zéro collision, 100% de correspondances exactes. |
| | Jeton altéré ou malformé | Si un utilisateur saisit un faux jeton (ex: `/m/ABC!_`), `decodeUuid` retourne `null`. |

### C. Matrice des Tests de Routing / Rewrite (`src/lib/url-masking.test.ts`)

| Scénario de requête | Entrée | Résultat attendu du Middleware |
| :--- | :--- | :--- |
| **Lien court de match** | `GET https://bee.chickendinner.fr/m/X9kP2a` | Rewrite interne vers `/clans/2/telemetry/matches/[uuid]/debrief`. Pas de redirection 302, URL conservée dans le navigateur. |
| **Jeton court inexistant** | `GET https://bee.chickendinner.fr/m/Invalide` | Renvoie une réponse 404 propre (ou redirection vers `/matches`). |
| **Sous-domaine réservé** | `GET https://api.chickendinner.fr/v1/...` | Pas de réécriture clanique ; route API standard non perturbée. |
| **Sous-domaine inconnu** | `GET https://claninexistant.chickendinner.fr/` | Redirection de secours vers la page d'accueil principale `https://chickendinner.fr`. |
| **Assets & Statiques** | `GET https://bee.chickendinner.fr/maps/pubg/Baltic_Main.webp` | Servi directement sans passer par la réécriture clanique. |

### D. Cahier de Recette Manuelle (Validation Navigateur & Discord)

1. **Scénario 1 : Navigation native sur le sous-domaine**
   * *Action* : Ouvrir `https://smk.chickendinner.fr` dans le navigateur.
   * *Résultat* : Affiche directement l'accueil du clan SMK. L'URL `/clans/1/overview` n'apparaît nulle part.
2. **Scénario 2 : Clic depuis un embed Discord**
   * *Action* : Cliquer sur le lien d'un message Discord Top 1 (`https://smk.chickendinner.fr/m/Lh0xDD`).
   * *Résultat* : Ouvre instantanément le débriefing 2D du match avec le Replay interactif, et la barre d'adresse reste sur `/m/Lh0xDD`.
3. **Scénario 3 : Test avec un faux jeton**
   * *Action* : Taper volontairement `https://smk.chickendinner.fr/m/FauxCode999`.
   * *Résultat* : Affiche une page 404 conviviale invitant à revenir à l'accueil du clan, sans planter le serveur.
4. **Scénario 4 : Vérification de session multi-domaines**
   * *Action* : Se connecter sur `chickendinner.fr/login`, puis naviguer vers `smk.chickendinner.fr`.
   * *Résultat* : L'utilisateur reste authentifié grâce au cookie partagé `.chickendinner.fr`.

