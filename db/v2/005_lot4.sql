-- PTCG v2 — lot 4 : classeurs, produits, réglages, états d'erreur.
-- Rejouable. psql -U pi_admin -d ptcg -f 005_lot4.sql

set search_path = v2, public;

-- ── Classeurs ────────────────────────────────────────────────────────────

drop view if exists v2.classeur_list;
create view v2.classeur_list with (security_invoker = true) as
select
  c.*,
  coalesce(c.pages, 0) * coalesce(c.slots_per_page, 0) as places,
  coalesce(x.remplies, 0) as remplies,
  coalesce(x.extensions, '[]'::json) as extensions
from v2.classeurs c
left join lateral (
  select sum(cs.filled) as remplies,
         json_agg(json_build_object(
           'set_id', cs.set_id, 'name', s.name, 'symbol', s.symbol, 'pages', cs.pages, 'filled', cs.filled,
           'sort_order', cs.sort_order, 'card_count', coalesce(s.card_count_total, s.card_count))
           order by cs.sort_order nulls last, s.release_date) as extensions
  from v2.classeur_sets cs join v2.sets s on s.id = cs.set_id
  where cs.classeur_id = c.id
) x on true;

-- Classeur et ses extensions rangées d'un coup (la liste remplace l'ancienne)
-- classeur : { id?, name, pages, slots_per_page, image, status, sort_order }
-- rangees  : [{ set_id, pages, filled }] dans l'ordre du classeur
create or replace function v2.save_classeur(classeur json, rangees json default '[]') returns text
  language plpgsql
  as $$
  declare
    r v2.classeurs;
    cid text;
  begin
    r := json_populate_record(null::v2.classeurs, classeur);
    if coalesce(btrim(r.name), '') = '' then raise exception 'Le nom du classeur est obligatoire'; end if;
    cid := coalesce(r.id, gen_random_uuid()::text);
    insert into v2.classeurs (id, name, pages, slots_per_page, image, status, sort_order)
    values (cid, btrim(r.name), r.pages, r.slots_per_page, r.image, coalesce(r.status, 'in_progress'),
            coalesce(r.sort_order, (select coalesce(max(sort_order), 0) + 1 from v2.classeurs)))
    on conflict (id) do update set
      name = excluded.name, pages = excluded.pages, slots_per_page = excluded.slots_per_page,
      image = excluded.image, status = excluded.status;

    delete from v2.classeur_sets where classeur_id = cid;
    insert into v2.classeur_sets (classeur_id, set_id, pages, filled, sort_order)
    select cid, x.set_id, x.pages, coalesce(x.filled, 0), x.ord
    from rows from (json_to_recordset(rangees) as (set_id text, pages int, filled int)) with ordinality as x(set_id, pages, filled, ord)
    on conflict do nothing;
    return cid;
  end
  $$;

-- ── Produits ─────────────────────────────────────────────────────────────

drop view if exists v2.produit_list;
create view v2.produit_list with (security_invoker = true) as
select p.*, s.name as set_name, s.symbol as set_symbol, s.release_date, s.serie_id
from v2.produits p
left join v2.sets s on s.id = p.set_id;

-- ── Réglages : état des automatisations et de l'appli ────────────────────

create or replace function v2.catalogue_stats() returns json
  language sql stable
  as $$
    select json_build_object(
      'sets', (select count(*) from v2.sets where source = 'tcgdex'),
      'sets_logo', (select count(*) from v2.sets where source = 'tcgdex' and logo is not null),
      'sets_en', (select count(*) from v2.sets where lang = 'en'),
      'cards', (select count(*) from v2.cards),
      'cards_image', (select count(*) from v2.cards where image is not null),
      'cards_en', (select count(*) from v2.cards where lang = 'en'),
      'cards_manual', (select count(*) from v2.cards where source = 'manual'),
      'cards_incomplete', (select count(*) from v2.cards where source = 'tcgdex' and category is null),
      'pokemon', (select count(*) from v2.pokemon),
      'pokemon_sprite', (select count(*) from v2.pokemon where sprite is not null),
      'cm_direct', (select count(*) from v2.cards where cardmarket_url like '%/Singles/%' and not cardmarket_url_manual),
      'cm_search', (select count(*) from v2.cards where cardmarket_url like '%/Search?%'),
      'cm_manual', (select count(*) from v2.cards where cardmarket_url_manual),
      'sets_without_code', (select count(*) from v2.sets s where s.source = 'tcgdex' and s.cardmarket_code is null
                              and exists (select 1 from v2.transactions t join v2.cards c on c.id = t.card_id where c.set_id = s.id)),
      'prices', (select count(*) from v2.cards where prices_updated_at is not null),
      'prices_tracked', (select count(distinct card_id) from v2.transactions where card_id is not null)
    )
  $$;

-- Une carte ajoutée à la main que TCGdex connaît maintenant (même nom, même numéro)
drop view if exists v2.manual_lookalikes;
create view v2.manual_lookalikes with (security_invoker = true) as
select m.id as manual_id, m.name as manual_name, m.number as manual_number,
       c.id as tcgdex_id, c.name as tcgdex_name, c.number as tcgdex_number, s.name as tcgdex_set,
       (select count(*) from v2.transactions t where t.card_id = m.id) as lignes
from v2.cards m
join v2.cards c on c.source = 'tcgdex' and v2.norm(c.name) = v2.norm(m.name)
               and ltrim(coalesce(c.number, ''), '0') = ltrim(coalesce(m.number, ''), '0')
join v2.sets s on s.id = c.set_id
where m.source = 'manual' and m.number is not null;

-- « Tu voulais dire… » quand une recherche ne trouve rien (dracofeu → Dracaufeu)
create or replace function v2.suggest_names(q text, lim int default 3) returns table (name text, score real)
  language sql stable
  as $$
    select n, max(public.similarity(v2.norm(n), v2.norm(q))) as score
    from (
      select name_fr as n from v2.pokemon where is_default
      union all select name from v2.sets
    ) x
    where public.similarity(v2.norm(n), v2.norm(q)) > 0.3
    group by n
    order by score desc
    limit lim
  $$;

-- ── Droits ───────────────────────────────────────────────────────────────

grant select on v2.classeur_list, v2.produit_list, v2.manual_lookalikes to anon;
grant execute on function v2.catalogue_stats(), v2.suggest_names(text, int), v2.save_classeur(json, json) to anon;

notify pgrst, 'reload schema';
