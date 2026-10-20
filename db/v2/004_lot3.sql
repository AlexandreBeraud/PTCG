-- PTCG v2 — lot 3 : catalogue (extensions, cartes, fiches Pokémon, labels, cartes manuelles).
-- Rejouable. psql -U pi_admin -d ptcg -f 004_lot3.sql

set search_path = v2, public;

-- Recherche de carte par la base, avec l'index trigramme : nom FR, nom EN et numéro
alter table v2.cards add column if not exists search text
  generated always as (v2.norm(coalesce(name, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(number, ''))) stored;
create index if not exists cards_search_trgm on v2.cards using gin (search gin_trgm_ops);
create index if not exists cards_category_idx on v2.cards (category, subtype);


-- ── Ce que j'ai de chaque carte ──────────────────────────────────────────

drop view if exists v2.controle_fiches;
drop view if exists v2.label_list;
drop view if exists v2.pokedex;
drop view if exists v2.fiche_cards;
drop view if exists v2.card_list;
drop view if exists v2.set_list;
drop view if exists v2.card_main_form;
drop view if exists v2.pokemon_resolved;
drop view if exists v2.card_stats;

create view v2.card_stats with (security_invoker = true) as
select card_id,
       coalesce(sum(qty) filter (where direction = 'vente' and status in ('a_mettre', 'en_vente')), 0) as en_stock,
       coalesce(sum(qty) filter (where direction = 'vente' and status = 'vendue'), 0) as vendues,
       coalesce(sum(qty) filter (where direction = 'achat'), 0) as achetees
from v2.transactions
where card_id is not null
group by card_id;

-- Type de forme retenu pour chaque Pokémon : label posé à la main, sinon détection
create view v2.pokemon_resolved with (security_invoker = true) as
select p.*,
       case when pl.pokemon_key is not null then pl.label_type else p.form_type end as label_type,
       pl.pokemon_key is not null as label_manuel
from v2.pokemon p
left join v2.pokemon_labels pl on pl.pokemon_key = p.key;

-- La fiche affichée à côté d'une carte (la première si elle en a plusieurs)
create view v2.card_main_form with (security_invoker = true) as
select distinct on (card_id) card_id, pokemon_key, source
from v2.card_forms
order by card_id, source = 'correction' desc, pokemon_key;

create view v2.card_list with (security_invoker = true) as
select
  c.id, c.set_id, c.number, c.name, c.name_en, c.category, c.subtype, c.dex_ids, c.rarity, c.variants,
  c.image, c.illustrator, c.lang, c.source, c.cardmarket_url, c.cardmarket_url_manual,
  c.price_trend, c.price_low, c.price_avg30, c.price_trend_holo, c.price_low_holo, c.price_avg30_holo,
  c.prices_updated_at, c.updated_at, c.search,
  -- famille affichée dans les filtres
  case
    when c.category = 'pokemon' then 'pokemon'
    when c.category = 'energy' then 'energie'
    when c.category = 'trainer' then case
      when lower(coalesce(c.subtype, '')) like 'supporter%' then 'supporter'
      when lower(coalesce(c.subtype, '')) in ('stade', 'stadium') then 'stade'
      when lower(coalesce(c.subtype, '')) like any (array['outil%', 'tool%', '%tool']) then 'outil'
      else 'objet' end
    else 'autre'
  end as famille,
  s.name as set_name, s.symbol as set_symbol, s.logo as set_logo, s.card_count as set_count,
  s.release_date, s.serie_id, se.name as serie_name,
  -- au-delà du nombre officiel : carte secrète
  (c.number ~ '^\d+$' and s.card_count is not null and c.number::int > s.card_count) as secrete,
  coalesce(st.en_stock, 0) as en_stock,
  coalesce(st.vendues, 0) as vendues,
  coalesce(st.achetees, 0) as achetees,
  f.pokemon_key, f.source as fiche_source,
  p.name_fr as pokemon_name, p.sprite, p.pokeapi_id,
  l.badge as form_badge, l.color as form_color
from v2.cards c
join v2.sets s on s.id = c.set_id
left join v2.series se on se.id = s.serie_id
left join v2.card_stats st on st.card_id = c.id
left join v2.card_main_form f on f.card_id = c.id
left join v2.pokemon_resolved p on p.key = f.pokemon_key
left join v2.labels l on l.enabled and l.type = p.label_type;

-- Cartes d'une fiche Pokémon (une carte à deux Pokémon est sur les deux fiches)
create view v2.fiche_cards with (security_invoker = true) as
select cf.pokemon_key as fiche, cf.source as fiche_par, cl.*
from v2.card_forms cf
join v2.card_list cl on cl.id = cf.card_id;


-- Compteurs des filtres de la page Cartes, pour la recherche en cours
create or replace function v2.card_facets(q text default null, serie text default null)
returns json
  language sql stable
  as $$
    with base as (
      select famille, serie_id, serie_name, release_date, en_stock, vendues
      from v2.card_list c
      where (q is null or not exists (
               select 1 from regexp_split_to_table(v2.norm(q), '\s+') w
               where w <> '' and position(w in c.search) = 0))
    )
    select json_build_object(
      'total', (select count(*) from base where serie is null or serie_id = serie),
      'familles', coalesce((select json_object_agg(famille, n) from (
          select famille, count(*) as n from base where serie is null or serie_id = serie group by famille) x), '{}'),
      'en_stock', (select count(*) from base where en_stock > 0 and (serie is null or serie_id = serie)),
      'vendues', (select count(*) from base where vendues > 0 and (serie is null or serie_id = serie)),
      'series', coalesce((select json_agg(json_build_object('id', serie_id, 'name', serie_name, 'n', n) order by recent desc nulls last) from (
          select serie_id, serie_name, count(*) as n, max(release_date) as recent from base group by serie_id, serie_name) y), '[]')
    )
  $$;


-- ── Extensions ───────────────────────────────────────────────────────────

create view v2.set_list with (security_invoker = true) as
select
  s.*,
  se.name as serie_name, se.logo as serie_logo,
  sp.color, coalesce(sp.hidden, false) as hidden, sp.sort_order,
  spp.color as serie_color, coalesce(spp.hidden, false) as serie_hidden, spp.sort_order as serie_sort,
  -- les séries les plus récentes d'abord
  max(s.release_date) over (partition by s.serie_id) as serie_release,
  coalesce(x.cartes, 0) as cartes,
  coalesce(x.en_stock, 0) as en_stock,
  coalesce(x.vendues, 0) as vendues
from v2.sets s
left join v2.series se on se.id = s.serie_id
left join v2.set_prefs sp on sp.kind = 'set' and sp.target_id = s.id
left join v2.set_prefs spp on spp.kind = 'serie' and spp.target_id = s.serie_id
left join (
  select c.set_id, count(*) as cartes, sum(coalesce(st.en_stock, 0)) as en_stock, sum(coalesce(st.vendues, 0)) as vendues
  from v2.cards c left join v2.card_stats st on st.card_id = c.id
  group by c.set_id
) x on x.set_id = s.id;


-- ── Pokédex ──────────────────────────────────────────────────────────────

create view v2.pokedex with (security_invoker = true) as
select
  p.key, p.dex, p.species_key, p.name_fr, p.name_en, p.form_type, p.label_type, p.label_manuel, p.is_default,
  p.generation, p.types, p.evolution_id, p.sort_order, p.sprite, p.pokeapi_id,
  l.badge as form_badge, l.color as form_color, l.name_fr as label_name,
  coalesce(x.cartes, 0) as cartes,
  coalesce(x.en_stock, 0) as en_stock,
  coalesce(x.vendues, 0) as vendues,
  v2.norm(coalesce(p.name_fr, '') || ' ' || coalesce(p.name_en, '') || ' ' || p.key) as search
from v2.pokemon_resolved p
left join v2.labels l on l.enabled and l.type = p.label_type
left join (
  select cf.pokemon_key, count(*) as cartes, sum(coalesce(st.en_stock, 0)) as en_stock, sum(coalesce(st.vendues, 0)) as vendues
  from v2.card_forms cf left join v2.card_stats st on st.card_id = cf.card_id
  group by cf.pokemon_key
) x on x.pokemon_key = p.key;


-- ── Labels ───────────────────────────────────────────────────────────────

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


-- ── Liens Cardmarket (calculés en base, utilisés par le job et par l'appli) ──
-- …/Singles/Phantasmal-Flames/Mega-Charizard-X-ex-V1-PFL013?language=2
-- « -V1 », « -V2 »… seulement quand plusieurs cartes de l'extension ont le même nom.

create or replace function v2.cm_slug(t text) returns text
  language sql immutable parallel safe
  as $$
    select trim(both '-' from regexp_replace(
      replace(regexp_replace(public.unaccent('public.unaccent', coalesce(t, '')), '[''’‘ʼ´`.]', '', 'g'), '&', ' '),
      '[^A-Za-z0-9]+', '-', 'g'))
  $$;

create or replace function v2.refresh_cardmarket_urls(only_set text default null) returns int
  language plpgsql security definer
  set search_path = v2, public
  as $$
  declare
    n int;
  begin
    with base as (
      select c.id, c.set_id, c.number, s.cardmarket_code as code,
             v2.cm_slug(coalesce(s.name_en, s.name)) as set_slug,
             v2.cm_slug(coalesce(c.name_en, c.name)) as card_slug,
             coalesce(c.name_en, c.name) as search_name,
             c.cardmarket_url_manual as manuel
      from v2.cards c join v2.sets s on s.id = c.set_id
      where only_set is null or c.set_id = only_set
    ),
    numbered as (
      -- les liens corrigés à la main comptent quand même dans la numérotation V1, V2…
      select b.*,
             count(*) over (partition by b.set_id, lower(b.card_slug)) as homonymes,
             row_number() over (partition by b.set_id, lower(b.card_slug)
                                order by nullif(regexp_replace(b.number, '\D', '', 'g'), '')::int nulls last, b.number) as rang
      from base b
    ),
    urls as (
      select id,
             case when nullif(btrim(code), '') is not null and set_slug <> '' then
               'https://www.cardmarket.com/fr/Pokemon/Products/Singles/' || set_slug || '/' || card_slug
               || case when homonymes > 1 then '-V' || rang else '' end
               || '-' || btrim(code) || case when number ~ '^\d+$' then lpad(number, 3, '0') else coalesce(number, '') end
               || '?language=2'
             else
               'https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString='
               || replace(replace(replace(replace(search_name, '%', '%25'), '&', '%26'), '#', '%23'), ' ', '%20')
             end as url
      from numbered
      where not manuel
    )
    update v2.cards c set cardmarket_url = u.url
    from urls u
    where c.id = u.id and c.cardmarket_url is distinct from u.url;
    get diagnostics n = row_count;
    return n;
  end
  $$;

-- Code Cardmarket d'une extension (PFL…) : enregistré puis liens recalculés tout de suite
create or replace function v2.set_cardmarket_code(set_id text, code text) returns int
  language plpgsql security definer
  set search_path = v2, public
  as $$
  begin
    update v2.sets s set cardmarket_code = nullif(upper(btrim(code)), '') where s.id = set_cardmarket_code.set_id;
    if not found then raise exception 'Extension introuvable'; end if;
    return v2.refresh_cardmarket_urls(set_cardmarket_code.set_id);
  end
  $$;

-- Lien d'une carte corrigé à la main ; vide = on revient au lien calculé
create or replace function v2.set_card_cardmarket_url(card_id text, url text) returns text
  language plpgsql security definer
  set search_path = v2, public
  as $$
  declare
    sid text;
    result text;
  begin
    update v2.cards c set cardmarket_url = nullif(btrim(url), ''), cardmarket_url_manual = nullif(btrim(url), '') is not null
     where c.id = set_card_cardmarket_url.card_id
    returning c.set_id into sid;
    if sid is null then raise exception 'Carte introuvable'; end if;
    if nullif(btrim(url), '') is null then perform v2.refresh_cardmarket_urls(sid); end if;
    select c.cardmarket_url into result from v2.cards c where c.id = set_card_cardmarket_url.card_id;
    return result;
  end
  $$;


-- ── Cartes absentes de TCGdex ────────────────────────────────────────────
-- Créées ou modifiées par l'appli (le référentiel reste fermé en écriture directe).
-- carte : { id?, set_id?, new_set_name?, number, name, category, subtype, rarity, variants[], image, cardmarket_url, pokemon_key }

create or replace function v2.save_manual_card(carte json) returns text
  language plpgsql security definer
  set search_path = v2, public
  as $$
  declare
    r record;
    cid text;
    sid text;
    pk text;
  begin
    select * into r from json_to_record(carte) as x(
      id text, set_id text, new_set_name text, number text, name text, category text, subtype text,
      rarity text, variants text[], image text, cardmarket_url text, pokemon_key text);

    if coalesce(btrim(r.name), '') = '' then raise exception 'Le nom de la carte est obligatoire'; end if;
    if r.id is not null and not exists (select 1 from v2.cards c where c.id = r.id and c.source = 'manual') then
      raise exception 'Seules les cartes ajoutées à la main se modifient ici';
    end if;

    sid := r.set_id;
    if coalesce(btrim(r.new_set_name), '') <> '' then
      select s.id into sid from v2.sets s where s.source = 'manual' and lower(s.name) = lower(btrim(r.new_set_name));
      if sid is null then
        sid := 'manual-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
        insert into v2.sets (id, name, source, lang) values (sid, btrim(r.new_set_name), 'manual', 'fr');
      end if;
    end if;
    if sid is null or not exists (select 1 from v2.sets s where s.id = sid) then raise exception 'Choisis l''extension'; end if;

    cid := coalesce(r.id, 'manual-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12));
    pk := nullif(r.pokemon_key, '');

    insert into v2.cards (id, set_id, number, name, category, subtype, rarity, variants, image, source, lang,
                          dex_ids, cardmarket_url, cardmarket_url_manual)
    values (cid, sid, nullif(btrim(r.number), ''), btrim(r.name), nullif(r.category, ''), nullif(r.subtype, ''),
            nullif(r.rarity, ''), coalesce(r.variants, '{}'), nullif(r.image, ''), 'manual', 'fr',
            case when pk is not null then array[(select p.dex from v2.pokemon p where p.key = pk)] end,
            nullif(btrim(r.cardmarket_url), ''), nullif(btrim(r.cardmarket_url), '') is not null)
    on conflict (id) do update set
      set_id = excluded.set_id, number = excluded.number, name = excluded.name, category = excluded.category,
      subtype = excluded.subtype, rarity = excluded.rarity, variants = excluded.variants, image = excluded.image,
      dex_ids = excluded.dex_ids, cardmarket_url = excluded.cardmarket_url,
      cardmarket_url_manual = excluded.cardmarket_url_manual, updated_at = now();

    -- la fiche choisie à la main prime sur les labels
    delete from v2.card_overrides o where o.card_id = cid;
    if pk is not null then insert into v2.card_overrides (card_id, pokemon_key) values (cid, pk); end if;
    if nullif(btrim(r.cardmarket_url), '') is null then perform v2.refresh_cardmarket_urls(sid); end if;
    perform v2.refresh_card_forms();
    return cid;
  end
  $$;

-- La carte arrive dans TCGdex : ventes, achats et corrections passent sur la carte TCGdex
create or replace function v2.replace_manual_card(manual_id text, tcgdex_id text) returns int
  language plpgsql security definer
  set search_path = v2, public
  as $$
  declare
    n int;
  begin
    if not exists (select 1 from v2.cards where id = manual_id and source = 'manual') then raise exception 'Carte manuelle introuvable'; end if;
    if not exists (select 1 from v2.cards where id = tcgdex_id and source = 'tcgdex') then raise exception 'Carte TCGdex introuvable'; end if;
    update v2.transactions set card_id = tcgdex_id where card_id = manual_id;
    get diagnostics n = row_count;
    delete from v2.card_overrides where card_id = manual_id;
    delete from v2.cards where id = manual_id;
    perform v2.refresh_card_forms();
    return n;
  end
  $$;

create or replace function v2.delete_manual_card(card_id text) returns void
  language plpgsql security definer
  set search_path = v2, public
  as $$
  begin
    if exists (select 1 from v2.transactions t where t.card_id = delete_manual_card.card_id) then
      raise exception 'Cette carte a des ventes ou des achats : remplace-la plutôt';
    end if;
    delete from v2.cards c where c.id = delete_manual_card.card_id and c.source = 'manual';
    perform v2.refresh_card_forms();
  end
  $$;


-- ── Contrôle du lot 3 ────────────────────────────────────────────────────
-- Chaque carte Pokémon vendue ou achetée doit être rangée sur une fiche qui a un sprite.

create view v2.controle_fiches with (security_invoker = true) as
select distinct c.id, c.name, c.set_id, c.number,
       case when f.card_id is null then 'sur aucune fiche' else 'fiche sans sprite' end as probleme
from v2.transactions t
join v2.cards c on c.id = t.card_id
left join v2.card_main_form f on f.card_id = c.id
left join v2.pokemon p on p.key = f.pokemon_key
where c.category = 'pokemon' and (f.card_id is null or p.sprite is null);


-- ── Droits ───────────────────────────────────────────────────────────────

grant select on v2.card_stats, v2.pokemon_resolved, v2.card_main_form, v2.card_list, v2.fiche_cards,
  v2.set_list, v2.pokedex, v2.label_list, v2.controle_fiches to anon, ptcg_job;
grant execute on function v2.card_facets(text, text), v2.cm_slug(text), v2.set_cardmarket_code(text, text), v2.set_card_cardmarket_url(text, text),
  v2.save_manual_card(json), v2.replace_manual_card(text, text), v2.delete_manual_card(text) to anon;
grant execute on function v2.refresh_cardmarket_urls(text) to anon, ptcg_job;

-- liens calculés par la base désormais (le job de nuit l'appelle aussi)
select v2.refresh_cardmarket_urls() as liens_mis_a_jour;

\echo '== Cartes vendues ou achetées sans fiche ou sans sprite (doit être vide)'
select * from v2.controle_fiches order by set_id, number;

notify pgrst, 'reload schema';
