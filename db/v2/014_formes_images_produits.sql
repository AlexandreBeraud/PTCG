-- PTCG v2 — formes masquées, images corrigées à la main (logos, sigles, sprites),
-- remplissage automatique des produits.
-- Rejouable. psql -U pi_admin -d ptcg -f 014_formes_images_produits.sql

set search_path = v2, public;

-- ── Images corrigées à la main : les jobs ne les écrasent plus ──────────

alter table v2.sets add column if not exists logo_manual text;
alter table v2.sets add column if not exists symbol_manual text;
alter table v2.pokemon add column if not exists sprite_manual text;

-- quoi : 'logo' ou 'symbol' ; vide = on rend la main au catalogue (la nuit suivante)
create or replace function v2.set_set_image(set_id text, quoi text, url text) returns void
  language plpgsql security definer
  set search_path = v2, public
  as $$
  declare
    v text := nullif(btrim(url), '');
  begin
    if quoi = 'logo' then
      update v2.sets s set logo_manual = v, logo = coalesce(v, s.logo) where s.id = set_set_image.set_id;
    elsif quoi = 'symbol' then
      update v2.sets s set symbol_manual = v, symbol = coalesce(v, s.symbol) where s.id = set_set_image.set_id;
    else
      raise exception 'Image inconnue : %', quoi;
    end if;
    if not found then raise exception 'Extension introuvable'; end if;
  end
  $$;

-- sprite : adresse d'une image, ou chemin sur le NAS précédé de « / »
create or replace function v2.set_pokemon_sprite(pokemon_key text, sprite text) returns void
  language plpgsql security definer
  set search_path = v2, public
  as $$
  declare
    v text := nullif(btrim(sprite), '');
  begin
    update v2.pokemon p set sprite_manual = v, sprite = coalesce(v, p.sprite) where p.key = set_pokemon_sprite.pokemon_key;
    if not found then raise exception 'Pokémon introuvable'; end if;
  end
  $$;


-- ── Formes masquées (Pokémon Dominant, talents particuliers…) ────────────
-- Une forme masquée disparaît du Pokédex et du choix des cartes ; ses cartes
-- reviennent sur la fiche de l'espèce (sauf celles corrigées à la main).

create table if not exists v2.pokemon_masques (
  pokemon_key text primary key references v2.pokemon(key) on delete cascade
);

create or replace view v2.card_forms with (security_invoker = true) as
select a.card_id,
       case when m.pokemon_key is not null and base.key is not null then base.key else a.pokemon_key end as pokemon_key,
       case when m.pokemon_key is not null and base.key is not null then 'espece' else a.source end as source
from v2.card_forms_auto a
left join v2.pokemon_masques m on m.pokemon_key = a.pokemon_key
left join v2.pokemon p on p.key = a.pokemon_key
left join v2.pokemon base on base.dex = p.dex and base.is_default
where not exists (select 1 from v2.card_overrides o where o.card_id = a.card_id)
union all
select o.card_id, o.pokemon_key, 'correction' from v2.card_overrides o;

drop view if exists v2.label_list;
drop view if exists v2.pokedex;

create view v2.pokedex with (security_invoker = true) as
select
  p.key, p.dex, p.species_key, p.name_fr, p.name_en, p.form_type, p.label_type, p.label_manuel, p.is_default,
  p.generation, p.types, p.evolution_id, p.sort_order, p.sprite, p.pokeapi_id,
  l.badge as form_badge, l.color as form_color, l.name_fr as label_name,
  coalesce(x.cartes, 0) as cartes,
  coalesce(x.en_stock, 0) as en_stock,
  coalesce(x.vendues, 0) as vendues,
  coalesce(x.en_stock, 0) > 0 as a_du_stock,
  m.pokemon_key is not null as masque,
  v2.norm(coalesce(p.name_fr, '') || ' ' || coalesce(p.name_en, '') || ' ' || p.key) as search
from v2.pokemon_resolved p
left join v2.labels l on l.enabled and l.type = p.label_type
left join v2.pokemon_masques m on m.pokemon_key = p.key
left join (
  select cf.pokemon_key, count(*) as cartes, sum(coalesce(st.en_stock, 0)) as en_stock, sum(coalesce(st.vendues, 0)) as vendues
  from v2.card_forms cf left join v2.card_stats st on st.card_id = cf.card_id
  group by cf.pokemon_key
) x on x.pokemon_key = p.key;

create view v2.label_list with (security_invoker = true) as
select l.*,
       coalesce(f.formes, 0) as formes,
       coalesce(f.cartes, 0) as cartes
from v2.labels l
left join (
  select p.label_type, count(*) as formes, sum(p.cartes) as cartes
  from v2.pokedex p
  where p.label_type is not null and (not p.is_default or p.label_manuel)
  group by p.label_type
) f on f.label_type = l.type;

-- Choix d'une carte : sans les formes masquées
create or replace function v2.picker_entities(kind text, q text default null, lim int default 40)
returns table (type text, key text, name text, image text, sprite text, pokeapi_id int, form_badge text, form_color text,
               dex int, tokens text, cartes bigint, en_stock bigint)
  language plpgsql stable
  as $$
  #variable_conflict use_column
  declare
    nq text := btrim(regexp_replace(v2.norm(coalesce(q, '')), '[^a-z0-9]+', ' ', 'g'));
    fams text[] := case kind when 'personnage' then '{supporter}' when 'objet' then '{objet,outil}'
                             when 'lieu' then '{stade}' when 'energie' then '{energie}' else '{}' end;
  begin
    if kind = 'pokemon' then
      -- tout le Pokédex (les fiches qui ont des cartes, sauf les formes masquées), dans son ordre
      return query
        select 'pokemon'::text, p.key, p.name_fr, null::text, p.sprite, p.pokeapi_id, p.form_badge, p.form_color,
               p.dex, null::text, p.cartes::bigint, p.en_stock::bigint
        from v2.pokedex p
        where p.cartes > 0 and not p.masque
          and (nq = '' or regexp_replace(p.search, '[^a-z0-9]+', ' ', 'g') like '%' || nq || '%')
        order by p.sort_order, p.key
        limit lim;
      return;
    end if;

    return query
      with fam as (
        select c.id, c.name, c.name_tokens as tok,
               coalesce(c.image_manual, c.image, c.image_fallback) as image, s.release_date,
               coalesce(st.en_stock, 0) as en_stock,
               v2.famille(c.category, c.subtype) = any (fams) as in_fam
        from v2.cards c
        join v2.sets s on s.id = c.set_id
        left join v2.card_stats st on st.card_id = c.id
        -- un personnage a aussi ses Pokémon (« Carchacrok de Cynthia ex »)
        where c.category in ('trainer', 'energy') or (kind = 'personnage' and c.name_tokens ~ ' (de|d|du) ')
      ),
      used as (
        select t.card_id, count(*) as n from v2.transactions t where t.card_id is not null group by t.card_id
      ),
      ent as (
        select e.id, e.name, e.image, ' ' || btrim(regexp_replace(v2.norm(e.name), '[^a-z0-9]+', ' ', 'g')) || ' ' as tok
        from v2.entites e
        where e.kind = picker_entities.kind
          and (nq = '' or regexp_replace(v2.norm(e.name), '[^a-z0-9]+', ' ', 'g') like '%' || nq || '%')
      ),
      lignes as (
        select 'entite'::text as type, 'e:' || e.id as key, e.name,
               coalesce(e.image, (array_agg(f.image order by f.release_date desc nulls last) filter (where f.image is not null))[1]) as image,
               e.tok, count(f.id) as cartes, coalesce(sum(f.en_stock), 0)::bigint as en_stock,
               coalesce(sum(u.n), 0) as usage, 0 as rang
        from ent e
        left join fam f on f.tok like '%' || e.tok || '%' and (kind = 'personnage' or f.in_fam)
        left join used u on u.card_id = f.id
        group by e.id, e.name, e.image, e.tok
        union all
        select 'nom', 'n:' || f.tok, min(f.name),
               (array_agg(f.image order by f.release_date desc nulls last) filter (where f.image is not null))[1],
               f.tok, count(*), sum(f.en_stock)::bigint, coalesce(sum(u.n), 0), 1
        from fam f
        left join used u on u.card_id = f.id
        where f.in_fam and (nq = '' or f.tok like '%' || nq || '%')
          and not exists (select 1 from ent e where e.tok = f.tok)
        group by f.tok
      )
      select x.type, x.key, x.name, x.image, null::text, null::int, null::text, null::text, null::int, x.tok, x.cartes, x.en_stock
      from lignes x
      -- sans recherche : mes fiches et les noms déjà vendus ou achetés, par ordre alphabétique
      where nq <> '' or x.rang = 0 or x.usage > 0
      order by v2.norm(x.name), x.rang
      limit lim;
  end
  $$;


-- ── Produits ─────────────────────────────────────────────────────────────

drop view if exists v2.produit_list;
create view v2.produit_list with (security_invoker = true) as
select p.*, s.name as set_name, s.symbol as set_symbol, s.logo as set_logo, s.release_date, s.serie_id,
       se.name as serie_name
from v2.produits p
left join v2.sets s on s.id = p.set_id
left join v2.series se on se.id = s.serie_id;

-- Crée les produits qui manquent : un par type choisi et par extension sortie
-- (d'un bloc, ou depuis une date), « à obtenir ». Renvoie le nombre créé.
create or replace function v2.fill_produits(types text[], serie text default null, depuis date default null) returns int
  language plpgsql
  as $$
  declare
    n int;
  begin
    insert into v2.produits (set_id, type, obtained)
    select s.id, t.type, false
    from v2.sets s
    cross join unnest(types) as t(type)
    where s.source = 'tcgdex' and s.parent_id is null
      and (serie is null or s.serie_id = serie)
      and (depuis is null or s.release_date >= depuis)
      and s.release_date <= current_date
      and not exists (select 1 from v2.produits p where p.set_id = s.id and p.type = t.type);
    get diagnostics n = row_count;
    return n;
  end
  $$;


-- ── Droits ───────────────────────────────────────────────────────────────

grant select on v2.pokemon_masques, v2.card_forms, v2.pokedex, v2.label_list, v2.produit_list to anon, ptcg_job;
grant insert, delete on v2.pokemon_masques to anon;
grant execute on function v2.set_set_image(text, text, text), v2.set_pokemon_sprite(text, text),
  v2.picker_entities(text, text, int), v2.fill_produits(text[], text, date) to anon;

notify pgrst, 'reload schema';
