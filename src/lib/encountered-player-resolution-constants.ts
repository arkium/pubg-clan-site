// Seuils partagés par le cron de résolution de clan adverse, la dérivation de
// statut (API/UI) et la résolution manuelle ciblée — une seule source pour ne
// jamais laisser deux endroits du code diverger sur ces valeurs.

export const ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION = 2
export const ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS = 3

// Un joueur déjà résolu récemment via Player (par un autre clan suivi qui l'a
// croisé) n'est pas re-résolu par l'API — valeur de départ à ajuster après
// observation, les tags de clan changent rarement.
export const PLAYER_CLAN_RESOLUTION_FRESHNESS_DAYS = 7
