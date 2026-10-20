-- PTCG v2 — une fiche corrigée à la main s'applique tout de suite,
-- tris « en stock d'abord » et ordre du sélecteur de carte.
-- Avant, chaque correction recalculait tout le rangement (vue matérialisée
-- card_forms) : plusieurs clics d'affilée saturaient PostgREST (erreur 504).
-- Le rangement automatique devient card_forms_auto (recalculé quand les
-- labels changent et chaque nuit) ; card_forms est une vue qui y ajoute les
-- corrections, lues en direct.
-- Rejouable. psql -U pi_admin -d ptcg -f 007_corrections_fiches.sql

set search_path = v2, public;

-- les vues qui lisent card_forms sont recréées pour lire la nouvelle
drop view if exists v2.transaction_sets;
drop view if exists v2.contact_list;
drop view if exists v2.commande_list;
drop view if exists v2.stock;
drop view if exists v2.transaction_list;
drop view if exists v2.controle_fiches;
drop view if exists v2.label_list;
drop view if exists v2.pokedex;
drop view if exists v2.fiche_cards;
drop view if exists v2.card_list;
drop view if exists v2.card_main_form;

do $$
begin
  if exists (select 1 from pg_matviews where schemaname = 'v2' and matviewname = 'card_forms') then
    alter materialized view v2.card_forms rename to card_forms_auto;
  end if;
end $$;

create or replace view v2.card_forms with (security_invoker = true) as
select a.card_id, a.pokemon_key, a.source
from v2.card_forms_auto a
where not exists (select 1 from v2.card_overrides o where o.card_id = a.card_id)
union all
select o.card_id, o.pokemon_key, 'correction' from v2.card_overrides o;

create or replace function v2.refresh_card_forms() returns void
  language sql security definer
  set search_path = v2, public
  as $$ refresh materialized view concurrently v2.card_forms_auto $$;

-- Cartes ajoutées à la main : leur fiche est une correction, plus besoin de tout recalculer
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

    -- la fiche choisie à la main prime sur les labels (lue en direct par card_forms)
    delete from v2.card_overrides o where o.card_id = cid;
    if pk is not null then insert into v2.card_overrides (card_id, pokemon_key) values (cid, pk); end if;
    if nullif(btrim(r.cardmarket_url), '') is null then perform v2.refresh_cardmarket_urls(sid); end if;
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
  end
  $$;


-- ── Catalogue ────────────────────────────────────────────────────────────

-- La fiche affichée à côté d'une carte (la première si elle en a plusieurs)
create view v2.card_main_form with (security_invoker = true) as
select distinct on (card_id) card_id, pokemon_key, source
from v2.card_forms
order by card_id, source = 'correction' desc, pokemon_key;

create view v2.card_list with (security_invoker = true) as
select
  c.id, c.set_id, c.number, c.name, c.name_en, c.category, c.subtype, c.dex_ids, c.rarity, c.variants,
  coalesce(c.image_manual, c.image, c.image_fallback) as image,
  case when c.image_manual is not null then 'manuelle' when c.image is not null then 'tcgdex'
       when c.image_fallback is not null then 'secours' end as image_source,
  c.illustrator, c.lang, c.source, c.cardmarket_url, c.cardmarket_url_manual,
  c.price_trend, c.price_low, c.price_avg30, c.price_trend_holo, c.price_low_holo, c.price_avg30_holo,
  c.prices_updated_at, c.updated_at, c.search,
  v2.famille(c.category, c.subtype) as famille,
  s.name as set_name, s.symbol as set_symbol, s.logo as set_logo, s.card_count as set_count,
  s.release_date, s.serie_id, se.name as serie_name,
  (c.number ~ '^\d+$' and s.card_count is not null and c.number::int > s.card_count) as secrete,
  coalesce(st.en_stock, 0) as en_stock,
  coalesce(st.vendues, 0) as vendues,
  coalesce(st.achetees, 0) as achetees,
  f.pokemon_key, f.source as fiche_source,
  p.name_fr as pokemon_name, p.sprite, p.pokeapi_id,
  l.badge as form_badge, l.color as form_color,
  c.name_tokens,
  v2.number_sort(c.number) as number_sort,
  coalesce(st.en_stock, 0) > 0 as a_du_stock
from v2.cards c
join v2.sets s on s.id = c.set_id
left join v2.series se on se.id = s.serie_id
left join v2.card_stats st on st.card_id = c.id
left join v2.card_main_form f on f.card_id = c.id
left join v2.pokemon_resolved p on p.key = f.pokemon_key
left join v2.labels l on l.enabled and l.type = p.label_type;

create view v2.fiche_cards with (security_invoker = true) as
select cf.pokemon_key as fiche, cf.source as fiche_par, cl.*
from v2.card_forms cf
join v2.card_list cl on cl.id = cf.card_id;

create view v2.pokedex with (security_invoker = true) as
select
  p.key, p.dex, p.species_key, p.name_fr, p.name_en, p.form_type, p.label_type, p.label_manuel, p.is_default,
  p.generation, p.types, p.evolution_id, p.sort_order, p.sprite, p.pokeapi_id,
  l.badge as form_badge, l.color as form_color, l.name_fr as label_name,
  coalesce(x.cartes, 0) as cartes,
  coalesce(x.en_stock, 0) as en_stock,
  coalesce(x.vendues, 0) as vendues,
  coalesce(x.en_stock, 0) > 0 as a_du_stock,
  v2.norm(coalesce(p.name_fr, '') || ' ' || coalesce(p.name_en, '') || ' ' || p.key) as search
from v2.pokemon_resolved p
left join v2.labels l on l.enabled and l.type = p.label_type
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

create view v2.controle_fiches with (security_invoker = true) as
select distinct c.id, c.name, c.set_id, c.number,
       case when f.card_id is null then 'sur aucune fiche' else 'fiche sans sprite' end as probleme
from v2.transactions t
join v2.cards c on c.id = t.card_id
left join v2.card_main_form f on f.card_id = c.id
left join v2.pokemon p on p.key = f.pokemon_key
where c.category = 'pokemon' and (f.card_id is null or p.sprite is null);

-- ── Ventes et achats ─────────────────────────────────────────────────────

create view v2.transaction_list with (security_invoker = true) as
select
  t.*,
  case when t.kind = 'lot' then coalesce(t.price, 0) else coalesce(t.price, 0) * t.qty end as total,
  case t.kind
    when 'lot' then 'Lot de cartes'
    when 'accessoire' then coalesce(a.name, 'Accessoire')
    else coalesce(c.name, nullif(t.label, ''), 'Produit scellé')
  end as title,
  c.number,
  coalesce(c.image_manual, c.image, c.image_fallback) as card_image,
  c.rarity,
  c.variants as card_variants,
  c.cardmarket_url,
  c.price_trend,
  c.price_low,
  c.category,
  c.source as card_source,
  s.id as set_key,
  s.name as set_name,
  s.symbol as set_symbol,
  s.card_count as set_count,
  a.image as accessoire_image,
  o.direction as commande_direction,
  o.status as commande_status,
  o.ordered_on,
  o.arrived_on,
  o.link as commande_link,
  o.contact_id,
  ct.pseudo as contact,
  f.pokemon_key,
  p.sprite,
  p.pokeapi_id,
  l.badge as form_badge,
  l.color as form_color,
  coalesce(o.arrived_on, o.ordered_on, (t.created_at at time zone 'Europe/Paris')::date) as day,
  v2.norm(concat_ws(' ', c.name, c.name_en, a.name, t.label, s.name, c.number, ct.pseudo, t.for_account)) as search,
  -- tri par extension (date de sortie) puis numéro, couleur de l'extension ou de son bloc
  s.release_date as set_release,
  se.name as serie_name,
  v2.number_sort(c.number) as number_sort,
  coalesce(sp.color, spp.color) as set_color,
  c.price_low_holo
from v2.transactions t
left join v2.cards c on c.id = t.card_id
left join v2.sets s on s.id = coalesce(c.set_id, t.set_id)
left join v2.series se on se.id = s.serie_id
left join v2.set_prefs sp on sp.kind = 'set' and sp.target_id = s.id
left join v2.set_prefs spp on spp.kind = 'serie' and spp.target_id = s.serie_id
left join v2.accessoires a on a.id = t.accessoire_id
left join v2.commandes o on o.id = t.commande_id
left join v2.contacts ct on ct.id = o.contact_id
left join lateral (
  select cf.pokemon_key from v2.card_forms cf
  where cf.card_id = t.card_id
  order by cf.source = 'correction' desc, cf.pokemon_key
  limit 1
) f on true
left join v2.pokemon p on p.key = f.pokemon_key
left join v2.pokemon_labels pl on pl.pokemon_key = p.key
left join v2.labels l on l.enabled and l.type = case when pl.pokemon_key is not null then pl.label_type else p.form_type end;

create view v2.stock with (security_invoker = true) as
select * from v2.transaction_list
where direction = 'vente' and status in ('a_mettre', 'en_vente');

-- le total d'une commande comprend le port (payé par l'acheteur pour une vente)
create view v2.commande_list with (security_invoker = true) as
select
  o.*,
  ct.pseudo as contact,
  ct.icon as contact_icon,
  coalesce(x.lignes, 0) as lignes,
  coalesce(x.cartes, 0) as cartes,
  coalesce(x.total, 0) + o.shipping as total,
  x.apercu
from v2.commandes o
left join v2.contacts ct on ct.id = o.contact_id
left join lateral (
  select count(*) as lignes, sum(qty) as cartes, sum(total) as total,
         string_agg(title, ', ' order by created_at) as apercu
  from v2.transaction_list t where t.commande_id = o.id
) x on true;

create view v2.contact_list with (security_invoker = true) as
select
  ct.*,
  count(o.id) filter (where o.direction = 'vente') as commandes_vente,
  count(o.id) filter (where o.direction = 'achat') as commandes_achat,
  coalesce(sum(o.cartes) filter (where o.direction = 'vente'), 0) as cartes_vendues,
  coalesce(sum(o.total) filter (where o.direction = 'vente'), 0) as total_vente,
  coalesce(sum(o.total) filter (where o.direction = 'achat'), 0) as total_achat,
  count(o.id) filter (where o.status in ('a_envoyer', 'a_payer')) as en_attente,
  max(coalesce(o.ordered_on, o.created_at::date)) as derniere,
  min(coalesce(o.ordered_on, o.created_at::date)) as premiere,
  -- statuts de ses commandes, pour le filtre (À envoyer, Envoyée…)
  coalesce(array_agg(distinct o.status) filter (where o.id is not null), '{}') as statuts
from v2.contacts ct
left join v2.commande_list o on o.contact_id = ct.id
group by ct.id;

-- Extensions présentes dans les ventes ou les achats, avec leur bloc (filtre Extension)
create view v2.transaction_sets with (security_invoker = true) as
select direction, set_key, set_name, serie_name, set_release, count(*) as lignes
from v2.transaction_list
where set_key is not null
group by direction, set_key, set_name, serie_name, set_release;

-- Choix d'une carte : Pokémon dans l'ordre du Pokédex, le reste par ordre alphabétique
-- kind : pokemon | personnage | objet | lieu | energie
-- type : pokemon (fiche du Pokédex), entite (fiche créée à la main), nom (toutes les versions d'un nom)
-- tokens : nom en mots entiers, pour lire ses cartes dans card_list (name_tokens)

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
      -- sans recherche : les Pokémon déjà vendus ou achetés ; toujours dans l'ordre du Pokédex
      return query
        select 'pokemon'::text, p.key, p.name_fr, null::text, p.sprite, p.pokeapi_id, p.form_badge, p.form_color,
               p.dex, null::text, p.cartes::bigint, p.en_stock::bigint
        from v2.pokedex p
        left join (
          select cf.pokemon_key, count(*) as n
          from v2.transactions t join v2.card_forms cf on cf.card_id = t.card_id
          group by cf.pokemon_key
        ) u on u.pokemon_key = p.key
        where p.cartes > 0
          and ((nq = '' and u.n > 0)
            or (nq <> '' and regexp_replace(p.search, '[^a-z0-9]+', ' ', 'g') like '%' || nq || '%'))
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


-- ── Droits ───────────────────────────────────────────────────────────────

grant select on v2.card_forms, v2.card_forms_auto, v2.card_main_form, v2.card_list, v2.fiche_cards, v2.pokedex,
  v2.label_list, v2.controle_fiches, v2.transaction_list, v2.stock, v2.transaction_sets, v2.commande_list,
  v2.contact_list to anon, ptcg_job;

notify pgrst, 'reload schema';
