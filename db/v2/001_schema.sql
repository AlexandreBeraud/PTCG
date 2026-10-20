-- PTCG v2 — schéma de départ (lot 0)
-- Vit à côté de l'ancien schéma public, qui n'est pas touché.
-- Rejouable : ne crée que ce qui manque.
-- psql -U pi_admin -d ptcg -f 001_schema.sql

create extension if not exists pg_trgm;
create extension if not exists unaccent;

create schema if not exists v2;
set search_path = v2, public;

-- unaccent() n'est pas immutable, il faut une enveloppe pour pouvoir l'indexer
create or replace function v2.norm(t text) returns text
  language sql immutable parallel safe
  as $$ select lower(public.unaccent('public.unaccent', coalesce(t, ''))) $$;


-- ── Référentiel : écrit par les jobs, lu par l'appli ────────────────────

create table if not exists series (
  id          text primary key,
  name        text not null,
  logo        text,
  updated_at  timestamptz not null default now()
);

create table if not exists sets (
  id               text primary key,
  serie_id         text references series(id),
  name             text not null,
  name_en          text,
  logo             text,
  symbol           text,
  card_count       int,
  card_count_total int,
  release_date     date,
  lang             text not null default 'fr' check (lang in ('fr', 'en')),
  -- sous-extension dont les cartes sont déjà rangées dans une autre (Galerie de Dresseurs…)
  parent_id        text references sets(id),
  cardmarket_code  text,
  source           text not null default 'tcgdex' check (source in ('tcgdex', 'manual')),
  updated_at       timestamptz not null default now()
);

create table if not exists cards (
  id                    text primary key,
  set_id                text not null references sets(id),
  number                text,
  name                  text not null,
  name_en               text,
  category              text check (category in ('pokemon', 'trainer', 'energy')),
  subtype               text,
  dex_ids               int[],
  rarity                text,
  variants              text[] not null default '{}',
  image                 text,
  illustrator           text,
  lang                  text not null default 'fr' check (lang in ('fr', 'en')),
  source                text not null default 'tcgdex' check (source in ('tcgdex', 'manual')),
  cardmarket_url        text,
  cardmarket_url_manual boolean not null default false,
  price_trend           numeric(10,2),
  price_low             numeric(10,2),
  price_avg30           numeric(10,2),
  price_trend_holo      numeric(10,2),
  price_low_holo        numeric(10,2),
  price_avg30_holo      numeric(10,2),
  prices_updated_at     timestamptz,
  updated_at            timestamptz not null default now(),
  check (variants <@ array['normale', 'reverse', 'holo', '1ere_edition'])
);
create index if not exists cards_set_idx on cards (set_id);
create index if not exists cards_dex_idx on cards using gin (dex_ids);
create index if not exists cards_name_trgm on cards using gin (v2.norm(name) gin_trgm_ops);

-- une ligne par espèce ET par forme (charizard, charizard-mega-x, charizard-gmax…)
create table if not exists pokemon (
  key          text primary key,
  dex          int not null,
  species_key  text not null,
  name_fr      text,
  name_en      text,
  form_type    text,
  is_default   boolean not null default true,
  generation   int,
  types        text[],
  evolution_id int,
  sort_order   int,
  sprite       text
);
create index if not exists pokemon_dex_idx on pokemon (dex);
create index if not exists pokemon_name_trgm on pokemon using gin (v2.norm(name_fr) gin_trgm_ops);

create table if not exists job_runs (
  id          bigserial primary key,
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  summary     jsonb,
  error       text
);
create index if not exists job_runs_job_idx on job_runs (job, started_at desc);


-- ── Labels de formes : repris tels quels ────────────────────────────────

create table if not exists label_categories (
  id         text primary key,
  name       text not null,
  parent_id  text references label_categories(id) on delete set null,
  hidden     boolean not null default false,
  sort_order int
);

create table if not exists labels (
  type        text primary key,
  name_fr     text not null,
  badge       text,
  color       text,
  enabled     boolean not null default true,
  prefixes    text[] not null default '{}',
  suffixes    text[] not null default '{}',
  category_id text references label_categories(id) on delete set null,
  sort_order  int
);

create table if not exists pokemon_labels (
  pokemon_key text primary key,
  label_type  text not null references labels(type) on delete cascade
);

-- correction rare : une carte que les labels rangent sur la mauvaise fiche
create table if not exists card_overrides (
  card_id     text primary key references cards(id) on delete cascade,
  pokemon_key text not null references pokemon(key)
);


-- ── Données d'Alex : écrites par l'appli ────────────────────────────────

create table if not exists set_prefs (
  kind       text not null check (kind in ('serie', 'set')),
  target_id  text not null,
  color      text,
  sort_order int,
  hidden     boolean not null default false,
  primary key (kind, target_id)
);

create table if not exists classeurs (
  id             text primary key default gen_random_uuid()::text,
  name           text not null,
  pages          int,
  slots_per_page int,
  image          text,
  status         text not null default 'in_progress' check (status in ('in_progress', 'complete')),
  sort_order     int,
  created_at     timestamptz not null default now()
);

create table if not exists classeur_sets (
  classeur_id text not null references classeurs(id) on delete cascade,
  set_id      text not null references sets(id),
  pages       int,
  filled      int not null default 0,
  sort_order  int,
  primary key (classeur_id, set_id)
);

create table if not exists produits (
  id          text primary key default gen_random_uuid()::text,
  set_id      text references sets(id),
  type        text not null default 'booster' check (type in ('booster', 'etb', 'coffret', 'deck', 'premium', 'portfolio', 'autre')),
  description text,
  image       text,
  obtained    boolean not null default false,
  obtained_on date,
  sort_order  int,
  created_at  timestamptz not null default now()
);

create table if not exists contacts (
  id         text primary key default gen_random_uuid()::text,
  pseudo     text not null unique,
  icon       text,
  created_at timestamptz not null default now()
);

create table if not exists commandes (
  id         text primary key default gen_random_uuid()::text,
  contact_id text references contacts(id) on delete set null,
  direction  text not null check (direction in ('vente', 'achat')),
  ordered_on date,
  arrived_on date,
  link       text,
  -- vente : a_envoyer → envoye → arrive ; achat : a_payer → paye → arrive
  status     text not null check (status in ('a_envoyer', 'envoye', 'a_payer', 'paye', 'arrive')),
  shipping   numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists commandes_contact_idx on commandes (contact_id);

create table if not exists accessoires (
  id         text primary key default gen_random_uuid()::text,
  name       text not null,
  image      text,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id            text primary key default gen_random_uuid()::text,
  -- 'ajout' = carte entrée en stock sans achat (sortie d'un booster…)
  direction     text not null check (direction in ('vente', 'achat', 'ajout')),
  commande_id   text references commandes(id) on delete set null,
  kind          text not null default 'carte' check (kind in ('carte', 'lot', 'accessoire', 'produit')),
  card_id       text references cards(id),
  accessoire_id text references accessoires(id),
  set_id        text references sets(id),
  label         text,
  condition     text check (condition in ('Mint', 'Near Mint', 'Excellent', 'Good', 'Light Played', 'Played', 'Poor', 'Neuf', 'Occasion')),
  variant       text check (variant in ('normale', 'reverse', 'holo', '1ere_edition')),
  lang          text,
  price         numeric(10,2),
  qty           int not null default 1 check (qty > 0),
  status        text check (status in ('a_mettre', 'en_vente', 'vendue')),
  for_account   text,
  crop          smallint check (crop between 0 and 100),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (kind <> 'carte' or card_id is not null),
  check (kind <> 'accessoire' or accessoire_id is not null),
  check ((direction = 'vente') = (status is not null))
);
create index if not exists transactions_card_idx on transactions (card_id);
create index if not exists transactions_commande_idx on transactions (commande_id);
create index if not exists transactions_dir_status_idx on transactions (direction, status);

create table if not exists settings (
  id         int primary key default 1 check (id = 1),
  theme      text not null default 'braise',
  accent     text,
  radius     text not null default 'normal',
  lot_image  text,
  view_modes jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict do nothing;


-- ── Droits ──────────────────────────────────────────────────────────────
-- L'appli passe par PostgREST avec le rôle anon : lecture partout,
-- écriture seulement sur les données d'Alex. Les jobs auront leur propre accès (lot 1).

grant usage on schema v2 to anon;
grant select on all tables in schema v2 to anon;
grant insert, update, delete on
  set_prefs, classeurs, classeur_sets, produits, contacts, commandes,
  accessoires, transactions, settings,
  labels, label_categories, pokemon_labels, card_overrides
  to anon;
grant execute on function v2.norm(text) to anon;

notify pgrst, 'reload schema';
