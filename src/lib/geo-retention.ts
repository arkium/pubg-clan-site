/**
 * Conservation de la géolocalisation de la télémétrie (replay 2D, tracés) — décision du 2026-10-27,
 * docs/ops/database-performance.md §4.4. Elle pèse l'essentiel de la télémétrie pour ces seuls usages : gardée
 * 30 jours, 90 pour un Top 1 ou une partie custom, puis vidée chaque nuit par `applyGeoRetention`
 * (`src/lib/telemetry-geo-purge.ts`, maintenance de 01:15) — une fois ouvert l'interrupteur de /settings/database,
 * fermé par défaut. Statistiques et reste de la télémétrie ne sont pas concernés.
 *
 * Module pur : les pages /a-propos/methodologie et /confidentialite affichent ces durées.
 *
 * Constantes et non réglage d'interface, par décision du 2026-10-27 : la durée est un engagement daté de la page
 * Confidentialité, elle change par un déploiement relu, avec `LEGAL_UPDATED_AT` et `METHODOLOGY_UPDATED_AT`. Valeurs
 * possibles : les seuils de `GEO_PURGE_THRESHOLDS` (7, 14, 30, 60, 90), les seuls que compte le cron de 06:00.
 */
export const GEO_RETENTION_DAYS = 30

/** Matchs protégés (`PROTECTED` de telemetry-geo-purge.ts) : Top 1 et parties custom, support des tournois. */
export const GEO_PROTECTED_RETENTION_DAYS = 90
