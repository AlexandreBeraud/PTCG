#!/usr/bin/env bash
# Bascule PTCG : dernière reprise, la nouvelle appli prend le port 8083,
# l'ancienne passe sur 8999 en lecture seule (consultation et secours).
#
#   ./infra/bascule.sh            faire la bascule
#   ./infra/bascule.sh --force    même si le Bilan ancien/nouveau diffère
#   ./infra/bascule.sh --retour   revenir à l'ancienne appli sur 8083
#
# À lancer depuis le dépôt sur le Pi (~/ptcg-repo).
set -uo pipefail
cd "$(dirname "$0")/.."

if [ -f jobs/.env ]; then set -a; . jobs/.env; set +a; fi
HUB="${HUB:-$HOME/hub}"
PG_CONTAINER="${PG_CONTAINER:-postgres-db-1}"
PG_USER="${PG_USER:-pi_admin}"
BACKUP_DIR="${BACKUP_DIR:-/mnt/nas/Sauvegardes/ptcg/quotidien}"
CADDY="${CADDY_CONTAINER:-hub-caddy-1}"
LOGS="$(mktemp -d)"

sql() { docker exec -i -e PGOPTIONS=-cclient_min_messages=warning "$PG_CONTAINER" psql -U "$PG_USER" -d ptcg -v ON_ERROR_STOP=1 -q "$@"; }
step() { echo; echo "== $*"; }
fail() { echo; echo "Arrêt : $*" >&2; exit 1; }

# recharge Caddy depuis le fichier (le conteneur est recréé si les ports changent)
reload_caddy() {
  (cd "$HUB" && docker compose up -d >/dev/null 2>&1) || return 1
  docker restart "$CADDY" >/dev/null || return 1
  sleep 3
  docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1
}

check() {
  step "Vérification"
  local new old
  new=$(curl -s -m 10 "http://localhost:$1/")
  old=$(curl -s -m 10 "http://localhost:$2/")
  echo "$new" | grep -q 'css/tokens.css' && echo "  :$1 → nouvelle appli" || echo "  ⚠ :$1 ne sert pas la nouvelle appli"
  echo "$old" | grep -q 'data.js' && echo "  :$2 → ancienne appli" || echo "  ⚠ :$2 ne sert pas l'ancienne appli"
  [ "$(curl -s -m 10 -o /dev/null -w '%{http_code}' -H 'Accept-Profile: v2' "http://localhost:$1/api/settings")" = 200 ] \
    && echo "  :$1/api → base v2 joignable" || echo "  ⚠ :$1/api ne répond pas"
}

if [ "${1:-}" = "--retour" ]; then
  step "1/2 L'ancienne appli redevient modifiable"
  sql < db/v2/021_retour.sql || fail "le retour SQL a échoué"
  step "2/2 Ports : ancienne appli sur 8083, nouvelle sur 8085"
  python3 infra/bascule_caddy.py "$HUB" retour || fail "Caddyfile non modifié"
  reload_caddy || fail "Caddy refuse la configuration : regarde docker logs $CADDY"
  check 8085 8083
  echo
  echo "Retour fait. L'ancienne appli est la référence ; relance les reprises (010, 011, 012) avant une nouvelle bascule."
  exit 0
fi

done_at=$(sql -tA -c "select to_char(max(done_at) at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI') from v2.bascule" 2>/dev/null)
[ -n "$done_at" ] && fail "la bascule est déjà faite (le $done_at). Pour revenir à l'ancienne appli : ./infra/bascule.sh --retour"

step "1/5 Sauvegarde complète avant bascule"
[ -d "$BACKUP_DIR" ] || fail "le dossier $BACKUP_DIR n'existe pas"
dump="$BACKUP_DIR/avant-bascule-$(date +%F-%H%M).dump"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -Fc ptcg > "$dump" && [ -s "$dump" ] || fail "sauvegarde impossible"
echo "  $dump ($(( $(stat -c %s "$dump") / 1024 )) Ko)"

step "2/5 Dernière reprise depuis l'ancienne appli"
for f in 010_reprise_labels 011_reprise_ventes 012_reprise_rangement; do
  if sql < "db/v2/$f.sql" > "$LOGS/$f.log" 2>&1; then
    echo "  $f : ok"
  else
    tail -15 "$LOGS/$f.log"
    fail "$f a échoué ; rien n'est basculé"
  fi
done
sed -n '/Comptes avant/,/rows)/p' "$LOGS/011_reprise_ventes.log" "$LOGS/012_reprise_rangement.log" | grep -v 'Comptes\|rows)\|^-\|quoi'
if grep -q 'Bilan identique' "$LOGS/011_reprise_ventes.log"; then
  grep 'Bilan identique' "$LOGS/011_reprise_ventes.log" | sed 's/^ */  /'
else
  sed -n '/Bilan mois par mois/,/verdict/p' "$LOGS/011_reprise_ventes.log"
  [ "${1:-}" = "--force" ] || fail "le Bilan diffère de l'ancienne appli (relance avec --force pour basculer quand même)"
fi

step "3/5 Contrôle des fiches Pokémon"
n=$(sql -tA -c "select count(*) from v2.controle_fiches")
[ "$n" = 0 ] && echo "  chaque carte vendue ou achetée est sur une fiche avec sprite" || echo "  ⚠ $n carte(s) sans fiche ou sans sprite (voir v2.controle_fiches)"

step "4/5 L'ancienne appli passe en lecture seule"
sql < db/v2/020_bascule.sql | sed 's/^ */  /' || fail "bascule SQL impossible"

step "5/5 Ports : nouvelle appli sur 8083, ancienne sur 8999"
if ! python3 infra/bascule_caddy.py "$HUB" aller; then
  sql < db/v2/021_retour.sql >/dev/null
  fail "Caddyfile non modifié ; l'ancienne appli est de nouveau modifiable"
fi
if ! reload_caddy; then
  cat "$HUB/Caddyfile.avant-bascule" > "$HUB/Caddyfile"
  reload_caddy
  sql < db/v2/021_retour.sql >/dev/null
  fail "Caddy refuse la nouvelle configuration ; tout est remis comme avant"
fi
check 8083 8999

echo
echo "Bascule faite. Pense à enregistrer la config du hub :"
echo "  cd $HUB && git commit -am 'PTCG : nouvelle appli sur 8083, ancienne sur 8999' && git push"
echo "Retour arrière si besoin : ./infra/bascule.sh --retour"
