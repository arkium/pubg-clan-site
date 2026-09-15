#!/usr/bin/env bash
# Diagnostic LECTURE SEULE du serveur MariaDB — à lancer en root sur l'hôte de la base
# (Webmin → Outils → Terminal, ou `bash scripts/db-server-diagnostic.sh`).
#
# Collecte ce qu'aucune requête SQL ne donne depuis l'application : RAM, conteneur, processus
# co-hébergés, fichiers de configuration, puis l'état InnoDB et les droits de chaque compte.
# Ne modifie rien. Les empreintes de mot de passe sont masquées dans la sortie.
# Voir docs/ops/database-performance.md §4.1 et §4.3.

OUT="/root/diag-mariadb-$(date +%F-%H%M).txt"

if ! mysql -e 'SELECT 1' >/dev/null 2>&1; then
  echo "Connexion MariaDB en root impossible sans mot de passe (unix_socket)."
  echo "Relancer depuis un shell root, ou créer /root/.my.cnf ([client] user=root password=...) le temps du diagnostic."
  exit 1
fi

{
  echo "=== Système ==="
  date
  hostnamectl 2>/dev/null | grep -E 'Operating|Kernel|Virtualization|Architecture'
  echo "virtualisation : $(systemd-detect-virt 2>/dev/null || echo 'non détectée')"
  echo "coeurs : $(nproc)"
  free -m
  swapon --show
  echo "limite mémoire cgroup : $(cat /sys/fs/cgroup/memory.max 2>/dev/null || echo 'n/a')"

  echo; echo "=== Disque ==="
  df -h / "$(mysql -N -e 'SELECT @@datadir')" 2>/dev/null

  echo; echo "=== 20 processus les plus gourmands en mémoire ==="
  ps -eo rss,user,args --sort=-rss | head -21 \
    | awk 'NR==1 {print "Mo\tUSER\tCOMMANDE"; next} {rss=$1; user=$2; $1=""; $2=""; printf "%d\t%s\t%.110s\n", rss/1024, user, $0}'

  echo; echo "=== Services actifs ==="
  systemctl list-units --type=service --state=running --no-pager --no-legend | awk '{print $1}'

  if command -v docker >/dev/null 2>&1; then
    echo; echo "=== Conteneurs Docker ==="
    docker stats --no-stream --format '{{.Name}}  {{.MemUsage}}'
  fi

  echo; echo "=== Réglages MariaDB présents dans les fichiers de configuration ==="
  grep -rnE '^\s*(innodb_buffer_pool|innodb_log_file_size|max_connections|tmp_table_size|max_heap_table_size|table_open_cache|performance_schema|userstat|slow_query|long_query_time)' \
    /etc/mysql /etc/my.cnf /etc/my.cnf.d 2>/dev/null || echo "(aucun réglage explicite : valeurs par défaut)"

  echo; echo "=== MariaDB : mémoire et compteurs ==="
  mysql -t <<'SQL'
SELECT VERSION() AS version,
       ROUND(@@innodb_buffer_pool_size / 1048576) AS buffer_pool_mo,
       ROUND(@@innodb_buffer_pool_chunk_size / 1048576) AS chunk_mo,
       @@max_connections AS max_conn,
       ROUND(@@innodb_log_file_size / 1048576) AS redo_log_mo,
       ROUND(@@tmp_table_size / 1048576) AS tmp_table_mo,
       ROUND(@@max_heap_table_size / 1048576) AS heap_table_mo,
       ROUND(@@sort_buffer_size / 1024) AS sort_buffer_ko,
       ROUND(@@join_buffer_size / 1024) AS join_buffer_ko;

SHOW GLOBAL STATUS WHERE Variable_name IN (
  'Uptime', 'Max_used_connections', 'Threads_connected',
  'Innodb_buffer_pool_read_requests', 'Innodb_buffer_pool_reads',
  'Innodb_buffer_pool_pages_free', 'Innodb_buffer_pool_pages_total',
  'Created_tmp_tables', 'Created_tmp_disk_tables', 'Slow_queries');

SELECT table_schema AS base,
       ROUND(SUM(data_length) / 1048576) AS donnees_mo,
       ROUND(SUM(index_length) / 1048576) AS index_mo,
       COUNT(*) AS tables
FROM information_schema.tables
WHERE table_schema NOT IN ('information_schema', 'performance_schema', 'sys', 'mysql')
GROUP BY table_schema
ORDER BY SUM(data_length + index_length) DESC;
SQL

  echo; echo "=== Comptes et privilèges globaux ==="
  mysql -t -e "SELECT User, Host, plugin, Super_priv AS super, Shutdown_priv AS shutdown,
                      Create_user_priv AS create_user, Grant_priv AS grant_opt, File_priv AS file,
                      Process_priv AS process
               FROM mysql.user ORDER BY User, Host"

  echo; echo "=== Droits détaillés des comptes non système (mots de passe masqués) ==="
  mysql -N -e "SELECT CONCAT('SHOW GRANTS FOR ''', User, '''@''', Host, ''';')
               FROM mysql.user WHERE User NOT IN ('root', 'mysql', 'mariadb.sys', '')" \
    | mysql -N --force 2>&1 \
    | sed -E "s/(PASSWORD|USING) '[^']*'/\1 '***'/g"

  echo; echo "=== Connexions ouvertes : compte, origine, base ==="
  mysql -t -e "SELECT USER AS compte, SUBSTRING_INDEX(HOST, ':', 1) AS origine, DB AS base, COUNT(*) AS connexions
               FROM information_schema.PROCESSLIST GROUP BY 1, 2, 3 ORDER BY 4 DESC"

  echo; echo "=== Activité par compte (depuis l'activation de userstat) ==="
  mysql -t -e "SELECT USER AS compte, TOTAL_CONNECTIONS AS connexions, ROUND(BUSY_TIME) AS occupe_s,
                      ROWS_READ AS lignes_lues, ROWS_UPDATED AS lignes_modifiees
               FROM information_schema.USER_STATISTICS ORDER BY ROWS_READ DESC"
} > "$OUT" 2>&1

cat "$OUT"
echo
echo "Rapport enregistré dans $OUT"
