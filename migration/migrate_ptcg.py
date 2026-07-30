"""
Migre les données de PTCG Collection depuis Supabase (REST API, clé anon
de config.js) vers la base PostgreSQL self-hosted sur le Pi.

Insertion directe (base cible vide au départ) avec ON CONFLICT DO NOTHING
pour rester rejouable sans erreur si tu le relances.

Variables d'environnement attendues (.env, voir .env.example) :
    SUPABASE_URL, SUPABASE_ANON_KEY   (copiés depuis config.js)
    PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD

Lancement :
    python migrate_ptcg.py
"""

import os

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_ANON_KEY"]

# Toutes les tables du schéma self-hosted, dans un ordre qui respecte les
# clés étrangères (parents avant enfants).
TABLES = [
    "cards", "set_mapping",
    "blocs", "extensions", "classeurs", "classeur_extensions", "collection",
    "boosters", "goodies",
    "acheteurs", "vendeurs", "acheteur_commandes", "vendeur_commandes",
    "ventes", "depenses",
    "label_categories", "pokemon_label_assignments", "labels",
    "perso_objets", "card_category_overrides",
    "settings",
]

# Colonnes qui sont de VRAIS tableaux Postgres (text[]), pas des jsonb —
# psycopg2 adapte nativement une liste Python vers un tableau pour celles-ci
# et NE DOIT PAS recevoir de wrapper Json(), contrairement aux colonnes
# jsonb (ven_types, dep_types, set_bloc_order, lbl_prefixes, ...) qui en
# ont besoin pour toute valeur dict/list.
ARRAY_COLUMNS = {("cards", "types")}


def supabase_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }


def fetch_table(table):
    all_rows = []
    offset = 0
    page_size = 1000
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            params={"select": "*"},
            headers={
                **supabase_headers(),
                "Range-Unit": "items",
                "Range": f"{offset}-{offset + page_size - 1}",
            },
            timeout=30,
        )
        if resp.status_code == 404:
            return None
        if resp.status_code not in (200, 206):
            resp.raise_for_status()
        page = resp.json()
        if not page:
            break
        all_rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return all_rows


def adapt_value(table, col, value):
    if (table, col) in ARRAY_COLUMNS:
        return value  # tableau Postgres natif, pas de wrapper
    if isinstance(value, (dict, list)):
        return psycopg2.extras.Json(value)
    return value


def insert_rows(conn, table, rows):
    if not rows:
        return 0
    cursor = conn.cursor()
    inserted = 0
    for row in rows:
        row = {k: v for k, v in row.items() if k not in ("updated_at",) and not k.endswith("_updated_at")}
        cols = list(row.keys())
        col_list = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join(["%s"] * len(cols))
        values = [adapt_value(table, c, row[c]) for c in cols]
        query = (
            f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders}) '
            f"ON CONFLICT DO NOTHING"
        )
        try:
            cursor.execute(query, values)
            inserted += cursor.rowcount
        except Exception as exc:
            print(f"  ⚠ ligne ignorée dans {table} : {exc}")
            conn.rollback()
            continue
        conn.commit()
    cursor.close()
    return inserted


def main():
    conn = psycopg2.connect(
        host=os.environ.get("PG_HOST", "localhost"),
        port=os.environ.get("PG_PORT", "5432"),
        dbname=os.environ["PG_DATABASE"],
        user=os.environ["PG_USER"],
        password=os.environ["PG_PASSWORD"],
    )

    print(f"Migration Supabase → PostgreSQL local ({SUPABASE_URL} → "
          f"{os.environ.get('PG_HOST', 'localhost')}/{os.environ['PG_DATABASE']})\n")

    total = 0
    for table in TABLES:
        try:
            rows = fetch_table(table)
        except requests.RequestException as exc:
            print(f"{table:28s} — erreur réseau : {exc}")
            continue
        if rows is None:
            print(f"{table:28s} — n'existe pas côté Supabase, ignorée")
            continue
        inserted = insert_rows(conn, table, rows)
        total += inserted
        print(f"{table:28s} — {len(rows):5d} récupérée(s), {inserted:5d} insérée(s)")

    conn.close()
    print(f"\nTerminé — {total} ligne(s) au total insérée(s) dans la base locale.")


if __name__ == "__main__":
    main()
