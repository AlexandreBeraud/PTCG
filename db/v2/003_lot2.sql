-- PTCG v2 — lot 2 : ventes, achats, stock, commandes, contacts, Bilan.
-- Rejouable. psql -U pi_admin -d ptcg -f 003_lot2.sql

set search_path = v2, public;

-- id PokéAPI de chaque forme : repli sur l'artwork officiel quand le sprite du NAS manque
alter table v2.pokemon add column if not exists pokeapi_id int;

-- vente créée depuis une ligne d'achat reçue (évite de la mettre deux fois en stock)
alter table v2.transactions add column if not exists from_id text references v2.transactions(id) on delete set null;
create index if not exists transactions_from_idx on v2.transactions (from_id);
create index if not exists transactions_created_idx on v2.transactions (created_at);


-- ── Lignes affichées ─────────────────────────────────────────────────────
-- Une vente ou un achat avec tout ce qu'il faut pour l'afficher et le filtrer.
-- Un lot a un prix global (qty = nombre de cartes), le reste un prix unitaire.

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
  c.image as card_image,
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
  -- date de référence pour trier et filtrer : arrivée, sinon commande, sinon saisie
  coalesce(o.arrived_on, o.ordered_on, (t.created_at at time zone 'Europe/Paris')::date) as day,
  v2.norm(concat_ws(' ', c.name, c.name_en, a.name, t.label, s.name, c.number, ct.pseudo, t.for_account)) as search
from v2.transactions t
left join v2.cards c on c.id = t.card_id
left join v2.sets s on s.id = coalesce(c.set_id, t.set_id)
left join v2.accessoires a on a.id = t.accessoire_id
left join v2.commandes o on o.id = t.commande_id
left join v2.contacts ct on ct.id = o.contact_id
left join lateral (
  -- une carte à plusieurs Pokémon (Pikachu & Zekrom) prend la première fiche
  select cf.pokemon_key from v2.card_forms cf
  where cf.card_id = t.card_id
  order by cf.source = 'correction' desc, cf.pokemon_key
  limit 1
) f on true
left join v2.pokemon p on p.key = f.pokemon_key
left join v2.pokemon_labels pl on pl.pokemon_key = p.key
left join v2.labels l on l.enabled and l.type = case when pl.pokemon_key is not null then pl.label_type else p.form_type end;

-- Le stock : ce qui est à mettre en vente ou en ligne
create view v2.stock with (security_invoker = true) as
select * from v2.transaction_list
where direction = 'vente' and status in ('a_mettre', 'en_vente');

-- Compteurs des pastilles de statut (lignes, cartes, montant)
create or replace function v2.transaction_counts(dir text) returns json
  language sql stable
  as $$
    select coalesce(json_object_agg(k, json_build_object('lignes', n, 'cartes', q, 'total', m)), '{}')
    from (
      select coalesce(case when dir = 'vente' then status else coalesce(commande_status, 'sans') end, 'sans') as k,
             count(*) as n, sum(qty) as q, sum(total) as m
      from v2.transaction_list
      where direction = dir
      group by 1
    ) x
  $$;


-- ── Commandes et contacts ────────────────────────────────────────────────

create view v2.commande_list with (security_invoker = true) as
select
  o.*,
  ct.pseudo as contact,
  ct.icon as contact_icon,
  coalesce(x.lignes, 0) as lignes,
  coalesce(x.cartes, 0) as cartes,
  coalesce(x.total, 0) + case when o.direction = 'achat' then o.shipping else 0 end as total,
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
  min(coalesce(o.ordered_on, o.created_at::date)) as premiere
from v2.contacts ct
left join v2.commande_list o on o.contact_id = ct.id
group by ct.id;


-- ── Recherche de carte (sélecteur des ventes et achats) ──────────────────
-- Insensible aux accents et à la casse. "dracaufeu 013" ou "dracaufeu nuit"
-- marchent : chaque mot doit se trouver dans le nom, le numéro ou l'extension.

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
      -- le mot le plus long qui n'est pas un numéro sert à interroger l'index du nom
      select (select w from unnest(a) w where w !~ '^\d+$' order by length(w) desc limit 1) as w, a from words
    )
    select c.id, c.name, c.number, c.set_id, s.name, s.symbol, c.image, c.variants, c.rarity, c.lang, c.source,
           c.price_trend, c.price_low, c.cardmarket_url,
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


-- ── Bilan ────────────────────────────────────────────────────────────────
-- Mêmes règles que l'ancienne appli :
--  · une vente compte quand elle est vendue ET que sa commande est arrivée,
--    au mois d'arrivée (sinon au mois de saisie) ;
--  · un achat compte quand sa commande est arrivée, au mois de la commande
--    (sinon au mois de saisie) ; les frais de port de l'achat s'y ajoutent ;
--  · scope null = mon bilan (sans les ventes pour le compte de quelqu'un),
--    sinon le bilan de cette personne (ses ventes seulement).

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

create or replace function v2.bilan_mensuel(scope text default null)
returns table (mois date, ventes numeric, achats numeric, cartes_vendues bigint, cartes_achetees bigint)
  language sql stable
  as $$
    select mois,
           coalesce(sum(montant) filter (where sens = 'vente'), 0),
           coalesce(sum(montant) filter (where sens = 'achat'), 0),
           coalesce(sum(cartes) filter (where sens = 'vente'), 0),
           coalesce(sum(cartes) filter (where sens = 'achat'), 0)
    from v2.bilan_lignes(scope)
    group by mois
    order by mois
  $$;

-- Répartition par extension sur une période (bornes incluses, null = sans borne)
create or replace function v2.bilan_extensions(scope text default null, du date default null, au date default null)
returns table (sens text, set_name text, montant numeric, cartes bigint)
  language sql stable
  as $$
    select sens, coalesce(set_name, 'Sans extension'), sum(montant), sum(cartes)
    from v2.bilan_lignes(scope)
    where (du is null or mois >= date_trunc('month', du)) and (au is null or mois <= au)
    group by 1, 2
    order by 3 desc
  $$;

-- Extensions présentes dans les ventes ou les achats (filtre Extension)
create or replace view v2.transaction_sets with (security_invoker = true) as
select direction, set_key, set_name, count(*) as lignes
from v2.transaction_list
where set_key is not null
group by direction, set_key, set_name;

-- Noms utilisés dans « Pour le compte de »
create or replace view v2.for_accounts with (security_invoker = true) as
select for_account as name, count(*) as ventes
from v2.transactions
where coalesce(for_account, '') <> ''
group by for_account;


-- ── Écritures groupées (une seule transaction SQL) ───────────────────────

-- Achat ou vente multi-articles : la commande et ses lignes d'un coup.
-- commande : { contact_id, direction, ordered_on, arrived_on, link, status, shipping }
-- lignes : [{ kind, card_id, accessoire_id, set_id, label, condition, variant, lang, price, qty, status, for_account }]
create or replace function v2.save_commande(commande json, lignes json default '[]') returns text
  language plpgsql
  as $$
  declare
    cid text;
  begin
    insert into v2.commandes (contact_id, direction, ordered_on, arrived_on, link, status, shipping)
    select contact_id, direction, ordered_on, arrived_on, nullif(link, ''), status, coalesce(shipping, 0)
    from json_populate_record(null::v2.commandes, commande)
    returning id into cid;

    insert into v2.transactions (direction, commande_id, kind, card_id, accessoire_id, set_id, label,
                                 condition, variant, lang, price, qty, status, for_account, crop)
    select r.direction_cmd, cid, coalesce(r.kind, 'carte'), r.card_id, r.accessoire_id, r.set_id, r.label,
           r.condition, r.variant, r.lang, r.price, coalesce(r.qty, 1),
           case when r.direction_cmd = 'vente' then coalesce(r.status, 'vendue') end,
           nullif(r.for_account, ''), r.crop
    from (
      select (commande->>'direction') as direction_cmd, x.*
      from json_populate_recordset(null::v2.transactions, lignes) x
    ) r;

    return cid;
  end
  $$;

-- Réception d'un achat : la commande passe à « Reçue » et les lignes cochées
-- deviennent des ventes « À mettre en vente » (une seule fois par ligne).
create or replace function v2.receive_achat(commande_id text, line_ids text[] default '{}') returns int
  language plpgsql
  as $$
  declare
    n int;
  begin
    update v2.commandes o
       set status = 'arrive', arrived_on = coalesce(o.arrived_on, current_date)
     where o.id = receive_achat.commande_id and o.direction = 'achat';

    insert into v2.transactions (direction, kind, card_id, accessoire_id, set_id, label, condition, variant, lang, qty, status, crop, from_id)
    select 'vente', t.kind, t.card_id, t.accessoire_id, t.set_id, t.label, t.condition, t.variant, t.lang, t.qty, 'a_mettre', t.crop, t.id
    from v2.transactions t
    where t.commande_id = receive_achat.commande_id
      and t.direction = 'achat'
      and t.id = any (line_ids)
      and not exists (select 1 from v2.transactions v where v.from_id = t.id);
    get diagnostics n = row_count;
    return n;
  end
  $$;

-- Vendre une partie seulement d'une ligne : la ligne garde le reste,
-- une copie porte la quantité vendue. Renvoie l'id de la copie.
create or replace function v2.split_transaction(id text, qty int) returns text
  language plpgsql
  as $$
  declare
    src v2.transactions;
    new_id text;
  begin
    select * into src from v2.transactions t where t.id = split_transaction.id for update;
    if src.id is null then raise exception 'Ligne introuvable'; end if;
    if src.kind = 'lot' then raise exception 'Un lot ne se sépare pas'; end if;
    if split_transaction.qty < 1 or split_transaction.qty >= src.qty then
      raise exception 'Quantité à séparer entre 1 et %', src.qty - 1;
    end if;

    update v2.transactions t set qty = src.qty - split_transaction.qty, updated_at = now() where t.id = src.id;
    insert into v2.transactions (direction, commande_id, kind, card_id, accessoire_id, set_id, label, condition,
                                 variant, lang, price, qty, status, for_account, crop, from_id)
    values (src.direction, src.commande_id, src.kind, src.card_id, src.accessoire_id, src.set_id, src.label, src.condition,
            src.variant, src.lang, src.price, split_transaction.qty, src.status, src.for_account, src.crop, src.from_id)
    returning transactions.id into new_id;
    return new_id;
  end
  $$;

-- updated_at tenu par la base
create or replace function v2.touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists transactions_touch on v2.transactions;
create trigger transactions_touch before update on v2.transactions for each row execute function v2.touch();


-- ── Droits ───────────────────────────────────────────────────────────────

grant select on v2.transaction_list, v2.stock, v2.transaction_sets, v2.commande_list, v2.contact_list, v2.for_accounts to anon, ptcg_job;
grant execute on function
  v2.transaction_counts(text), v2.search_cards(text, int),
  v2.bilan_lignes(text), v2.bilan_mensuel(text), v2.bilan_extensions(text, date, date),
  v2.save_commande(json, json), v2.receive_achat(text, text[]), v2.split_transaction(text, int)
  to anon;

notify pgrst, 'reload schema';
