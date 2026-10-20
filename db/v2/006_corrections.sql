-- PTCG v2 — corrections après la bascule : images des cartes, frais de port des
-- ventes, couleurs des extensions, choix de carte par Pokémon / personnage, tris.
-- Rejouable. psql -U pi_admin -d ptcg -f 006_corrections.sql

set search_path = v2, public;

-- ── Colonnes ─────────────────────────────────────────────────────────────

-- image choisie à la main (jamais touchée par le job) et image de secours
-- trouvée par le job quand TCGdex n'en a pas
alter table v2.cards add column if not exists image_manual text;
alter table v2.cards add column if not exists image_fallback text;
alter table v2.cards add column if not exists image_checked_at timestamptz;

-- nom en mots entiers (« ambition de cynthia ») pour retrouver les cartes d'un personnage
alter table v2.cards add column if not exists name_tokens text
  generated always as (' ' || btrim(regexp_replace(v2.norm(name), '[^a-z0-9]+', ' ', 'g')) || ' ') stored;
create index if not exists cards_tokens_trgm on v2.cards using gin (name_tokens gin_trgm_ops);

-- frais de port d'une vente : payés par l'acheteur ; coché = j'ai payé l'envoi avec
alter table v2.commandes add column if not exists shipping_paid boolean not null default false;

-- Personnages, objets, lieux, énergies : une fiche (nom + image) qui regroupe
-- toutes les cartes dont le nom la contient (« Cynthia » → « Ambition de Cynthia »…)
create table if not exists v2.entites (
  id         text primary key default gen_random_uuid()::text,
  kind       text not null check (kind in ('personnage', 'objet', 'lieu', 'energie')),
  name       text not null,
  image      text,
  sort_order int,
  created_at timestamptz not null default now(),
  unique (kind, name)
);

create or replace function v2.famille(category text, subtype text) returns text
  language sql immutable parallel safe
  as $$
    select case
      when category = 'pokemon' then 'pokemon'
      when category = 'energy' then 'energie'
      when category = 'trainer' then case
        when lower(coalesce(subtype, '')) like 'supporter%' then 'supporter'
        when lower(coalesce(subtype, '')) in ('stade', 'stadium') then 'stade'
        when lower(coalesce(subtype, '')) like any (array['outil%', 'tool%', '%tool']) then 'outil'
        else 'objet' end
      else 'autre' end
  $$;

-- numéro de carte pour trier (« 013 » → 13, « TG05 » → 5)
create or replace function v2.number_sort(n text) returns int
  language sql immutable parallel safe
  as $$ select nullif(left(regexp_replace(coalesce(n, ''), '\D', '', 'g'), 9), '')::int $$;


-- ── Vues des ventes et achats ────────────────────────────────────────────

drop view if exists v2.transaction_sets;
drop view if exists v2.contact_list;
drop view if exists v2.commande_list;
drop view if exists v2.stock;
drop view if exists v2.transaction_list;
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


-- ── Catalogue ────────────────────────────────────────────────────────────

drop view if exists v2.fiche_cards;
drop view if exists v2.card_list;
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
  v2.number_sort(c.number) as number_sort
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

-- Liste légère des extensions pour les menus (rangées par bloc)
drop view if exists v2.set_options;
create view v2.set_options with (security_invoker = true) as
select s.id, s.name, s.release_date, s.serie_id, coalesce(se.name, 'Hors bloc') as serie_name,
       max(s.release_date) over (partition by s.serie_id) as serie_release,
       s.source, s.lang, s.symbol, s.card_count, s.card_count_total
from v2.sets s
left join v2.series se on se.id = s.serie_id;

create or replace function v2.search_cards(q text, lim int default 40)
returns table (
  id text, name text, number text, set_id text, set_name text, set_symbol text,
  image text, variants text[], rarity text, lang text, source text,
  price_trend numeric, price_low numeric, cardmarket_url text, en_stock bigint
)
  language sql stable
  as $$
    with words as (
      select array(select w from regexp_split_to_table(v2.norm(q), '\s+') w where w <> '') as a
    ),
    anchor as (
      select (select w from unnest(a) w where w !~ '^\d+$' order by length(w) desc limit 1) as w, a from words
    )
    select c.id, c.name, c.number, c.set_id, s.name, s.symbol, coalesce(c.image_manual, c.image, c.image_fallback),
           c.variants, c.rarity, c.lang, c.source, c.price_trend, c.price_low, c.cardmarket_url,
           (select coalesce(sum(t.qty), 0) from v2.transactions t
             where t.card_id = c.id and t.direction = 'vente' and t.status in ('a_mettre', 'en_vente'))
    from anchor, v2.cards c
    join v2.sets s on s.id = c.set_id
    where anchor.w is not null
      and v2.norm(c.name) like '%' || anchor.w || '%'
      and not exists (
        select 1 from unnest(anchor.a) w
        where position(w in v2.norm(c.name) || ' ' || lower(coalesce(c.number, '')) || ' ' || ltrim(lower(coalesce(c.number, '')), '0')
                           || ' ' || v2.norm(s.name) || ' ' || lower(c.set_id)) = 0
      )
    order by v2.norm(c.name) = anchor.w desc, s.release_date desc nulls last, c.set_id, c.number
    limit lim
  $$;

-- Image choisie à la main pour une carte (vide = on revient à TCGdex)
create or replace function v2.set_card_image(card_id text, image text) returns void
  language plpgsql security definer
  set search_path = v2, public
  as $$
  begin
    update v2.cards c set image_manual = nullif(btrim(set_card_image.image), '') where c.id = set_card_image.card_id;
    if not found then raise exception 'Carte introuvable'; end if;
  end
  $$;


-- ── Choix d'une carte : d'abord le Pokémon ou le personnage ──────────────
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
      -- sans recherche : les Pokémon déjà vendus ou achetés, les plus fréquents d'abord
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
        order by (nq <> '' and btrim(regexp_replace(v2.norm(p.name_fr), '[^a-z0-9]+', ' ', 'g')) = nq) desc,
                 case when nq = '' then -u.n end nulls last, p.sort_order, p.key
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
        where c.category in ('trainer', 'energy') or kind = 'personnage'
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
      -- sans recherche : mes fiches, puis les noms déjà vendus ou achetés
      where nq <> '' or x.rang = 0 or x.usage > 0
      order by x.rang, (nq <> '' and btrim(x.tok) = nq) desc, x.usage desc, x.name
      limit lim;
  end
  $$;


-- ── Bilan ────────────────────────────────────────────────────────────────
-- En plus des règles du lot 2 : le port d'une vente que l'acheteur a payé et
-- que je n'ai pas dépensé (case « payé » décochée) compte dans les revenus,
-- au mois d'arrivée. Il va au bilan de la personne si toute la commande est
-- pour son compte, sinon au mien.

create or replace function v2.bilan_lignes(scope text default null)
returns table (sens text, mois date, montant numeric, cartes bigint, set_key text, set_name text)
  language sql stable
  as $$
    select 'vente', date_trunc('month', coalesce(t.arrived_on, (t.created_at at time zone 'Europe/Paris')::date))::date,
           t.total, t.qty::bigint, t.set_key, t.set_name
    from v2.transaction_list t
    where t.direction = 'vente' and t.status = 'vendue' and t.commande_status = 'arrive'
      and case when scope is null then coalesce(t.for_account, '') = '' else t.for_account = scope end
    union all
    select 'vente', date_trunc('month', coalesce(o.arrived_on, (o.created_at at time zone 'Europe/Paris')::date))::date,
           o.shipping, 0, null, 'Frais de port'
    from v2.commandes o
    left join lateral (
      select case when count(distinct coalesce(t.for_account, '')) = 1 then max(coalesce(t.for_account, '')) end as compte
      from v2.transactions t where t.commande_id = o.id
    ) x on true
    where o.direction = 'vente' and o.status = 'arrive' and o.shipping > 0 and not o.shipping_paid
      and case when scope is null then coalesce(x.compte, '') = '' else x.compte = scope end
    union all
    select 'achat', date_trunc('month', coalesce(t.ordered_on, (t.created_at at time zone 'Europe/Paris')::date))::date,
           t.total, t.qty::bigint, t.set_key, t.set_name
    from v2.transaction_list t
    where scope is null and t.direction = 'achat' and t.commande_status = 'arrive'
    union all
    select 'achat', date_trunc('month', coalesce(o.ordered_on, (o.created_at at time zone 'Europe/Paris')::date))::date,
           o.shipping, 0, null, 'Frais de port'
    from v2.commandes o
    where scope is null and o.direction = 'achat' and o.status = 'arrive' and o.shipping > 0
  $$;

-- Ventes vendues mais pas encore comptées (commande pas encore reçue, ou pas de commande),
-- au mois de la commande : c'est l'écart avec ce qu'on additionne dans la liste des ventes
create or replace function v2.bilan_en_attente(scope text default null)
returns table (mois date, montant numeric, lignes bigint)
  language sql stable
  as $$
    select date_trunc('month', coalesce(t.ordered_on, (t.created_at at time zone 'Europe/Paris')::date))::date,
           sum(t.total), count(*)
    from v2.transaction_list t
    where t.direction = 'vente' and t.status = 'vendue' and t.commande_status is distinct from 'arrive'
      and case when scope is null then coalesce(t.for_account, '') = '' else t.for_account = scope end
    group by 1
    order by 1
  $$;


-- ── Droits ───────────────────────────────────────────────────────────────

grant select on v2.transaction_list, v2.stock, v2.transaction_sets, v2.commande_list, v2.contact_list to anon, ptcg_job;
grant select on v2.card_list, v2.fiche_cards, v2.set_options, v2.entites to anon, ptcg_job;
grant insert, update, delete on v2.entites to anon;
grant execute on function v2.famille(text, text), v2.number_sort(text), v2.search_cards(text, int),
  v2.set_card_image(text, text), v2.picker_entities(text, text, int),
  v2.bilan_lignes(text), v2.bilan_en_attente(text) to anon;

notify pgrst, 'reload schema';
