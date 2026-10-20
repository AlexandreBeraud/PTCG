#!/usr/bin/env bash
# Sauvegarde quotidienne de toute la base ptcg (ancienne appli + v2).
# Un fichier par jour, gardé KEEP_DAYS jours. Restauration :
#   docker exec -i postgres-db-1 pg_restore -U pi_admin -d ptcg --clean < ptcg-AAAA-MM-JJ.dump
set -uo pipefail
cd "$(dirname "$0")"

# mêmes réglages que les jobs Node (jobs/.env)
if [ -f .env ]; then set -a; . ./.env; set +a; fi
BACKUP_DIR="${BACKUP_DIR:-/mnt/nas/Sauvegardes/ptcg/quotidien}"
PG_CONTAINER="${PG_CONTAINER:-postgres-db-1}"
PG_USER="${PG_USER:-pi_admin}"
KEEP_DAYS="${KEEP_DAYS:-14}"

sql() { docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d ptcg -qtAX -v ON_ERROR_STOP=1 "$@"; }

run_id=$(echo "insert into v2.job_runs (job) values ('sauvegarde') returning id;" | sql 2>/dev/null)

fail() {
  echo "$(date '+%F %T') Erreur : $1" >&2
  if [ -n "$run_id" ]; then
    echo "update v2.job_runs set finished_at = now(), ok = false, error = :'err' where id = :id;" \
      | sql -v err="$1" -v id="$run_id" >/dev/null
  fi
  exit 1
}

[ -d "$BACKUP_DIR" ] || fail "le dossier $BACKUP_DIR n'existe pas (NAS non monté ? sinon crée-le ou change BACKUP_DIR dans jobs/.env)"

file="$BACKUP_DIR/ptcg-$(date +%F).dump"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -Fc ptcg > "$file.tmp" || { rm -f "$file.tmp"; fail "pg_dump a échoué"; }
[ -s "$file.tmp" ] || { rm -f "$file.tmp"; fail "sauvegarde vide"; }
mv "$file.tmp" "$file"

removed=$(find "$BACKUP_DIR" -maxdepth 1 -name 'ptcg-*.dump' -mtime +"$((KEEP_DAYS - 1))" -print -delete | wc -l)
size_kb=$(( $(stat -c %s "$file") / 1024 ))

if [ -n "$run_id" ]; then
  echo "update v2.job_runs set finished_at = now(), ok = true,
          summary = jsonb_build_object('fichier', :'f', 'taille_ko', :'s'::int, 'supprimees', :'r'::int)
        where id = :id;" \
    | sql -v f="$(basename "$file")" -v s="$size_kb" -v r="$removed" -v id="$run_id" >/dev/null
fi
echo "$(date '+%F %T') OK : $file ($size_kb Ko), $removed ancienne(s) supprimée(s)"
