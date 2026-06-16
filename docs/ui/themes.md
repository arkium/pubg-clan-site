# Système de thèmes et tokens CSS

## Vue d'ensemble

L'application supporte deux thèmes : `light` (clair) et `dark` (sombre). Le thème actif est stocké en `localStorage` et appliqué via l'attribut `data-app-theme` sur `<html>` et `<body>`. Les classes Tailwind courantes sont remappées automatiquement par `src/app/globals.css` selon le thème actif, sans aucun préfixe `dark:` dans le code applicatif.

---

## Initialisation du thème — `ThemeInitializer`

Fichier : `src/components/ThemeInitializer.tsx`

Rôle : éviter le flash de contenu (FOUC) au chargement de la page. Ce composant est un Client Component rendu nul (`return null`), inclus dans le layout racine. Il s'exécute côté client au premier rendu et applique le thème avant que la page soit visible.

Clé `localStorage` : `pubg_app_theme`

Comportement :

1. Lit `localStorage.getItem('pubg_app_theme')`.
2. Si la valeur est `'light'` ou `'dark'`, l'applique directement.
3. Sinon, consulte `window.matchMedia('(prefers-color-scheme: dark)')` pour détecter la préférence système.
4. Positionne `data-app-theme` sur `document.documentElement` et `document.body`.

Règles d'usage :

- Ne jamais lire ni écrire le thème depuis une page ou un composant. Passer uniquement par les tokens CSS.
- Le composant de bascule du thème (toggle dans le header) écrit dans `localStorage` et met à jour l'attribut `data-app-theme`.

---

## Tokens CSS globaux

Définis dans `src/app/globals.css` au niveau `:root` (thème clair par défaut).

### Tokens de layout

| Variable | Valeur | Rôle |
|---|---|---|
| `--app-content-max-width` | `64rem` (1024 px) | Largeur max du contenu centré |
| `--app-page-padding-x` | `1rem` | Padding horizontal des pages |
| `--app-page-padding-y` | `2rem` | Padding vertical des pages |
| `--app-panel-radius` | `0.75rem` | Rayon des panneaux |
| `--app-panel-shadow` | ombre légère | Ombre des panneaux |

### Tokens de surface et bordure

| Variable | Clair | Sombre |
|---|---|---|
| `--app-surface` | `#ffffff` | `#0f172a` |
| `--app-surface-muted` | `#f8fafc` | `#111827` |
| `--app-border` | `#e2e8f0` | `#334155` |
| `--page-surface` | `#f8fafc` | `#020617` |

### Tokens de thème UI (`--theme-ui-*`)

Ces tokens sont la source de vérité pour les couleurs de contenu. Ils varient entre thème clair et thème sombre.

| Token | Clair | Sombre |
|---|---|---|
| `--theme-ui-surface` | `rgb(255 255 255)` | `rgb(15 23 42)` |
| `--theme-ui-surface-soft` | `rgb(248 250 252)` | `rgb(17 24 39)` |
| `--theme-ui-surface-strong` | `rgb(241 245 249)` | `rgb(30 41 59)` |
| `--theme-ui-border` | `rgb(226 232 240)` | `rgb(51 65 85)` |
| `--theme-ui-text` | `rgb(15 23 42)` | `rgb(226 232 240)` |
| `--theme-ui-text-secondary` | `rgb(51 65 85)` | `rgb(203 213 225)` |
| `--theme-ui-text-muted` | `rgb(100 116 139)` | `rgb(148 163 184)` |
| `--theme-ui-hover` | `rgb(241 245 249)` | `rgb(30 41 59)` |

### Tokens de navigation (`--theme-nav-*`, `--theme-subnav-*`)

Pilotent les couleurs de la barre de navigation principale et des sous-navigations. Définis dans `:root` pour le thème clair et redéfinis dans `:root[data-app-theme='dark']`.

### Tokens de rôle nav (`--theme-owner-nav-*`, `--theme-admin-nav-*`)

Pilotent les couleurs des liens de navigation réservés aux rôles Owner (ambre/doré) et Admin (rouge). Utilisés par `ClanSectionNav`, `MemberSectionNav`, `SettingsSectionNav`.

---

## Remapping automatique des classes Tailwind

Quand `data-app-theme` est présent sur `<body>`, `globals.css` redéfinit les couleurs des classes Tailwind fréquentes via des sélecteurs `body[data-app-theme] :where(...)`. Cela permet d'écrire du code Tailwind standard sans aucun préfixe `dark:`.

| Classes Tailwind concernées | Redirigées vers |
|---|---|
| `bg-white`, `bg-white/90`, `bg-white/85`, `bg-white/80`, `bg-white/70`, `bg-white/60`, `bg-white/50`, `bg-white/30` | `--theme-ui-surface` |
| `bg-gray-50`, `bg-gray-50/60`, `bg-gray-50/50`, `bg-slate-50`, `bg-slate-50/60`, `bg-slate-50/70` | `--theme-ui-surface-soft` |
| `bg-gray-100`, `bg-slate-100` | `--theme-ui-surface-strong` |
| `border-gray-100`, `border-gray-200`, `border-gray-300`, `border-gray-400`, `border-slate-200`, `border-slate-300`, `border-white`, `border-white/80`, etc. | `--theme-ui-border` |
| `divide-gray-100`, `divide-gray-200`, `divide-gray-300`, `divide-slate-100`, `divide-slate-200` | `--theme-ui-border` |
| `text-gray-900`, `text-slate-900` | `--theme-ui-text` |
| `text-gray-800`, `text-gray-700`, `text-slate-700`, `text-slate-600`, `text-gray-600` | `--theme-ui-text-secondary` |
| `text-gray-500`, `text-slate-500`, `text-gray-400`, `text-slate-400` | `--theme-ui-text-muted` |
| `hover:bg-gray-50`, `hover:bg-slate-50`, `hover:bg-gray-100`, `hover:bg-slate-100` | `--theme-ui-hover` |

Le remapping s'active uniquement quand `data-app-theme` est présent sur `<body>` (c'est-à-dire après hydratation côté client). En rendu serveur, les valeurs claires par défaut s'appliquent.

---

## Classes utilitaires de layout

Définies dans `src/app/globals.css`.

### `.app-container`

```css
.app-container {
  width: 100%;
  max-width: var(--app-content-max-width); /* 64rem = 1024px */
  margin-inline: auto;
}
```

Conteneur centré, borné à 1024 px. À utiliser comme classe sur l'élément `<main>`.

### `.app-main`

```css
.app-main {
  padding-inline: max(var(--app-page-padding-x), 1rem);
  padding-block: var(--app-page-padding-y);
}
```

Ajoute le padding standard de page (1 rem horizontal, 2 rem vertical). À combiner avec `.app-container`.

### `.app-panel`

```css
.app-panel {
  border: 1px solid var(--app-border);
  border-radius: var(--app-panel-radius);
  background-color: var(--app-surface);
  box-shadow: var(--app-panel-shadow);
}
```

Panneau principal : fond blanc en clair, fond slate en sombre, bordure et ombre harmonisées.

### `.app-panel-muted`

```css
.app-panel-muted {
  border: 1px solid var(--app-border);
  border-radius: var(--app-panel-radius);
  background-color: var(--app-surface-muted);
  box-shadow: var(--app-panel-shadow);
}
```

Panneau secondaire : fond légèrement teinté, utile pour les zones d'information ou les sous-sections.

---

## Règles absolues

- Ne jamais hardcoder `bg-white`, `bg-slate-800`, `border-gray-200` ou toute couleur concrète dans les composants ou les pages. Utiliser les classes Tailwind remappées ou les tokens CSS directement.
- Ne jamais utiliser le préfixe `dark:` de Tailwind. Le remapping automatique rend ce préfixe inutile et les deux systèmes entrent en conflit.
- Ne jamais lire ni écrire `data-app-theme` depuis une page ou un composant. Seul `ThemeInitializer` et le composant de bascule y accèdent.
- Pour les nouvelles pages, partir systématiquement de `.app-container` + `.app-main` et des panneaux `.app-panel` / `.app-panel-muted`.
- Vérifier le rendu en thème clair et en thème sombre avant de livrer une page.
