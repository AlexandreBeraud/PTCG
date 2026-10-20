-- PTCG v2 — lot 1 : accès des jobs et rangement des cartes par fiche Pokémon.
-- Rejouable. psql -U pi_admin -d ptcg -f 002_lot1.sql

set search_path = v2, public;

-- Même normalisation que l'ancienne appli : minuscules, sans accents,
-- apostrophes typographiques ramenées à l'apostrophe droite.
create or replace function v2.norm(t text) returns text
  language sql immutable parallel safe
  as $$ select lower(public.unaccent('public.unaccent', translate(coalesce(t, ''), '’‘ʼ´`', ''''''''''''))) $$;
reindex index v2.cards_name_trgm;
reindex index v2.pokemon_name_trgm;

create or replace function v2.re_escape(t text) returns text
  language sql immutable parallel safe
  as $$ select regexp_replace(t, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') $$;

-- '' dans l'ancienne appli = « aucun label » forcé sur ce Pokémon
alter table v2.pokemon_labels alter column label_type drop not null;


-- ── Rôle des jobs ───────────────────────────────────────────────────────
-- Les jobs passent par PostgREST avec un jeton signé (role = ptcg_job).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ptcg_job') then
    create role ptcg_job nologin;
  end if;
end $$;
grant ptcg_job to authenticator;

grant usage on schema v2 to ptcg_job;
grant select on all tables in schema v2 to ptcg_job;
grant insert, update, delete on v2.series, v2.sets, v2.cards, v2.pokemon, v2.job_runs to ptcg_job;
grant usage on all sequences in schema v2 to ptcg_job;


-- ── Rangement des cartes par fiche ──────────────────────────────────────
-- Une carte Pokémon va sur la fiche de son espèce (numéro de Pokédex TCGdex),
-- sauf si le nom de la carte correspond au label d'une des formes de cette
-- espèce : elle va alors sur la fiche de la forme. Même règle que
-- _cardMatchesFormType dans l'ancienne appli (préfixes ET suffixes, mots entiers).

create or replace function v2.label_matches(card_name text, prefixes text[], suffixes text[]) returns boolean
  language sql immutable parallel safe
  as $$
    with p as (select array(select v2.norm(x) from unnest(prefixes) x where v2.norm(x) <> '') a),
         s as (select array(select v2.norm(x) from unnest(suffixes) x where v2.norm(x) <> '') a)
    select (cardinality(p.a) + cardinality(s.a)) > 0
      and (cardinality(p.a) = 0 or exists (select 1 from unnest(p.a) x where v2.norm(card_name) ~ ('\y' || v2.re_escape(x) || '\y')))
      and (cardinality(s.a) = 0 or exists (select 1 from unnest(s.a) x where v2.norm(card_name) ~ ('\y' || v2.re_escape(x) || '\y')))
    from p, s
  $$;

drop materialized view if exists v2.card_forms;
create materialized view v2.card_forms as
with poke_cards as (
  select c.id as card_id, c.name, d.dex
  from v2.cards c
  cross join lateral unnest(c.dex_ids) as d(dex)
  where c.category = 'pokemon'
),
forms as (
  select p.key, p.dex,
         case when pl.pokemon_key is not null then pl.label_type else p.form_type end as form_type
  from v2.pokemon p
  left join v2.pokemon_labels pl on pl.pokemon_key = p.key
  where not p.is_default
),
matches as (
  select pc.card_id, pc.dex, f.key,
         cardinality(l.prefixes) + cardinality(l.suffixes) as weight
  from poke_cards pc
  join forms f on f.dex = pc.dex
  join v2.labels l on l.type = f.form_type and l.enabled
  where v2.label_matches(pc.name, l.prefixes, l.suffixes)
),
picked as (
  -- la forme la plus précise gagne (Méga X plutôt que Méga), sinon l'espèce
  select distinct on (pc.card_id, pc.dex)
         pc.card_id,
         coalesce(m.key, base.key) as pokemon_key,
         case when m.key is not null then 'label' else 'espece' end as source
  from poke_cards pc
  left join matches m on m.card_id = pc.card_id and m.dex = pc.dex
  left join v2.pokemon base on base.dex = pc.dex and base.is_default
  order by pc.card_id, pc.dex, m.weight desc nulls last, m.key
)
select card_id, pokemon_key, source
from picked
where pokemon_key is not null
  and card_id not in (select card_id from v2.card_overrides)
union all
select card_id, pokemon_key, 'correction' from v2.card_overrides;

create unique index card_forms_uniq on v2.card_forms (card_id, pokemon_key);
create index card_forms_pokemon_idx on v2.card_forms (pokemon_key);

-- Appelée par les jobs après import, et par l'appli après une modif de label
create or replace function v2.refresh_card_forms() returns void
  language sql security definer
  set search_path = v2, public
  as $$ refresh materialized view concurrently v2.card_forms $$;

grant select on v2.card_forms to anon, ptcg_job;
grant execute on function v2.refresh_card_forms() to anon, ptcg_job;
grant execute on function v2.label_matches(text, text[], text[]) to anon, ptcg_job;

notify pgrst, 'reload schema';
