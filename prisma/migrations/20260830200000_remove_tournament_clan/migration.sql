-- TournamentClan n'a jamais ete ecrite (createTournament/updateTournament ne
-- l'utilisaient pas) : la selection manuelle de clans participants n'est pas
-- le modele retenu, l'auto-detection via les matchs decouverts suffit (voir
-- docs/TODO/todo.md, section "Idees - Tournois entre clans"). Verifie vide
-- (0 ligne) avant suppression le 2026-08-30.
DROP TABLE `TournamentClan`;
