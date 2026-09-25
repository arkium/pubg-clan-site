**Oui, c'est tout à fait possible**, et c'est une excellente idée pour donner une identité forte et une URL dédiée à chaque clan.

Voici un tour d'horizon de comment cela fonctionne et de ce qu'il faut prévoir techniquement :

---

### 1. Deux manières de l'implémenter

#### Option A : La redirection simple (301 / 302)
* **Comportement** : Le joueur tape `smk.chickendinner.fr` et son navigateur est redirigé vers `chickendinner.fr/clans/1/overview`.
* **Avantages** :
  * Très simple à implémenter.
  * Zéro casse-tête de sessions ou de cookies d'authentification (tout le monde reste sur le domaine principal).

#### Option B : Le sous-domaine persistant (Multi-tenancy / Rewrite)
* **Comportement** : L'URL reste `smk.chickendinner.fr` (et `smk.chickendinner.fr/members`, `smk.chickendinner.fr/stats`, etc.). Next.js réécrit l'URL en interne de façon transparente.
* **Avantages** :
  * Rendu ultra-pro et immersif, chaque clan a l'impression d'avoir son propre site web dédié.
* **Point d'attention** :
  * Le cookie de session (`pubg_clan_session`) doit être configuré avec `domain: '.chickendinner.fr'` pour être partagé entre le domaine principal et les sous-domaines.

---

### 2. Comment ça se met en place techniquement ?

#### 1. Côté DNS : Le Wildcard (`*`)
Pour éviter d'avoir à créer une entrée DNS manuelle à chaque fois qu'un clan est créé :
* Tu ajoutes un enregistrement DNS **Wildcard** chez ton registrar (ex: OVH, Cloudflare, etc.) :
  ```text
  Type: A
  Nom : *.chickendinner.fr
  Valeur : <IP_DE_TON_SERVEUR>
  ```
  *(Et de même pour `chickendinner.fr` et `@`)*. N'importe quel sous-domaine pointera ainsi automatiquement vers ton serveur.

#### 2. Côté Certificat SSL (HTTPS)
* Il faudra générer un certificat **Wildcard Let's Encrypt** couvrant `chickendinner.fr` et `*.chickendinner.fr`.
* Cela se fait simplement via `certbot` avec le plugin DNS de ton registrar (ou via un reverse-proxy comme Nginx / Caddy / Traefik, ou automatiquement si tu passes par Cloudflare).

#### 3. Côté Nginx (Reverse Proxy)
Dans la configuration Nginx du serveur :
```nginx
server {
    server_name chickendinner.fr *.chickendinner.fr;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 4. Côté Code (Next.js & Base de données)
Ton application est déjà très bien structurée pour cela :
1. **Modèle Prisma** : La table `Clan` possède déjà le champ `tag` (ex: `SMK`, `BEE`).
2. **Middleware / Proxy** : Dans [src/proxy.ts](file:///d:/Sources/pubg-clan-site/src/proxy.ts), Next.js intercepte la requête et peut inspecter l'hôte :
   ```typescript
   const host = request.headers.get('host') ?? ''
   // Si host === 'smk.chickendinner.fr'
   const subdomain = host.split('.')[0]?.toLowerCase()
   
   // Exclure www, api, etc.
   if (subdomain && !['www', 'api', 'admin'].includes(subdomain)) {
     // Option A : Redirection vers le clan correspondant
     return NextResponse.redirect(new URL(`/clans/${clanId}/overview`, request.url))
     
     // Ou Option B : Rewrite transparent
     // return NextResponse.rewrite(new URL(`/clans/${clanId}${pathname}`, request.url))
   }
   ```

---

### 3. Et quand j'ajoute un nouveau clan : est-ce automatique ?

**OUI, c'est 100% automatique et instantané.**

Dès que tu ajoutes un nouveau clan (qu'il soit créé via `/join`, approuvé dans le cycle de vie ou suivi depuis l'Observatoire), **son sous-domaine fonctionne immédiatement à la seconde même**, sans aucune action manuelle de ta part :

1. **Zéro action DNS** : Grâce à l'enregistrement Wildcard `*.chickendinner.fr`, tous les sous-domaines possibles pointent déjà vers ton serveur.
2. **Zéro action SSL** : Le certificat Wildcard Let's Encrypt couvre déjà nativement `*.chickendinner.fr` pour le HTTPS.
3. **Zéro action Nginx** : Nginx écoute déjà `*.chickendinner.fr` et passe la requête à Next.js.
4. **Résolution dynamique dans Next.js** :
   * Quand une requête arrive pour `ratz.chickendinner.fr`, Next.js extrait le préfixe `ratz`.
   * Il interroge la table `Clan` : `SELECT id FROM Clan WHERE LOWER(tag) = 'ratz' AND isActive = true`.
   * Dès que le clan existe en base de données, la redirection (ou le rewrite) s'active instantanément.

#### Les 3 règles d'or à prévoir :
* **Mots réservés (Blacklist)** : Ignorer les sous-domaines techniques (`www`, `api`, `admin`, `mail`, `dev`, `status`) pour éviter qu'un clan ne masque une route système.
* **Sous-domaine inconnu** : Si quelqu'un tape `bidon.chickendinner.fr` (aucun clan actif correspondant en base), Next.js redirige simplement vers la page d'accueil principale `chickendinner.fr`.
* **Casse & Caractères** : Les noms de domaine web sont toujours en minuscules (`[a-z0-9-]`). Le tag PUBG (ex: `SMK` ou `BEE`) est simplement converti en minuscules (`smk`, `bee`) pour faire la correspondance.

---

### En résumé
C'est totalement réalisable, très courant dans les applications SaaS ou communautaires, et ton architecture actuelle s'y prête parfaitement. 

Si tu prends le domaine, on pourra configurer ensemble le DNS wildcard, le SSL et la logique dans [src/proxy.ts](file:///d:/Sources/pubg-clan-site/src/proxy.ts) dès que tu seras prêt !