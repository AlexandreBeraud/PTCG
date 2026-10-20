-- Reprise des classeurs, des boosters et goodies (→ produits) et des préférences
-- d'extensions (couleur, masquage, ordre) de l'ancienne appli.
-- Rejouable : vide ces tables dans v2 puis les recharge depuis public.
-- Les extensions de l'ancienne appli sont retrouvées par le mapping TCG, sinon
-- par leur nom ; celles qui restent introuvables sont listées dans v2.migration_issues.

set search_path = v2, public;
\set ON_ERROR_STOP on

-- Après la bascule, la v2 est la référence : une reprise effacerait ce qui y a été saisi
create table if not exists v2.bascule (done_at timestamptz primary key default now());
do $$
begin
  if exists (select 1 from v2.bascule) then
    raise exception 'La bascule est faite : cette reprise effacerait ce que tu as saisi dans la nouvelle appli. Rien n''a été modifié.';
  end if;
end $$;

begin;

delete from v2.migration_issues where source in ('classeurs', 'produits', 'extensions');
delete from v2.classeur_sets;
delete from v2.classeurs;
delete from v2.produits;
delete from v2.set_prefs;

create or replace function pg_temp.d(t text) returns date language sql immutable as $$
  select case
    when t ~ '^\d{4}-\d{2}-\d{2}$' then t::date
    when t ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(t, 'DD/MM/YYYY') end $$;

-- extension de l'ancienne appli → extension TCGdex
create temp table ext_map on commit drop as
select e.ext_id as old_id, e.ext_nom as old_name, e.ext_couleur as color, coalesce(e.ext_is_hidden, false) as hidden,
       e.ext_sort_order as sort_order,
       coalesce(
         (select s.id from public.set_mapping m join v2.sets s on s.id = m.stm_tcgdex_set_id where m.stm_ptcg_ext_id = e.ext_id limit 1),
         (select s.id from v2.sets s where v2.norm(s.name) = v2.norm(e.ext_nom) order by s.source = 'tcgdex' desc limit 1),
         (select s.id from v2.sets s where lower(s.id) = lower(nullif(e.ext_code, '')) limit 1)
       ) as set_id
from public.extensions e
where coalesce(e.ext_user_id, 'default') = 'default';

insert into v2.migration_issues (source, source_id, probleme, detail)
select 'extensions', old_id, 'extension introuvable', coalesce(old_name, '?') || ' : pas d''équivalent TCGdex, ses classeurs et produits la perdent'
from ext_map where set_id is null;

-- couleur, masquage et ordre gardés sur l'extension TCGdex
insert into v2.set_prefs (kind, target_id, color, hidden, sort_order)
select distinct on (set_id) 'set', set_id, nullif(color, ''), hidden, sort_order
from ext_map where set_id is not null
order by set_id, hidden, sort_order nulls last
on conflict do nothing;

-- ── Classeurs ────────────────────────────────────────────────────────────

insert into v2.classeurs (id, name, pages, slots_per_page, image, status, sort_order)
select cla_id, coalesce(nullif(btrim(cla_nom), ''), 'Classeur'), cla_pages, cla_slots_par_page, nullif(cla_image, ''),
       case when cla_status = 'complete' then 'complete' else 'in_progress' end, cla_sort_order
from public.classeurs
where coalesce(cla_user_id, 'default') = 'default';

insert into v2.classeur_sets (classeur_id, set_id, pages, filled, sort_order)
select distinct on (ce.cle_classeur_id, m.set_id)
       ce.cle_classeur_id, m.set_id, ce.cle_pages, coalesce(ce.cle_filled, 0), ce.cle_sort_order
from public.classeur_extensions ce
join ext_map m on m.old_id = ce.cle_ext_id and m.set_id is not null
where exists (select 1 from v2.classeurs c where c.id = ce.cle_classeur_id)
order by ce.cle_classeur_id, m.set_id, ce.cle_sort_order;

insert into v2.migration_issues (source, source_id, probleme, detail)
select 'classeurs', ce.cle_classeur_id, 'extension perdue', coalesce(m.old_name, ce.cle_ext_id) || ' n''a pas d''équivalent TCGdex'
from public.classeur_extensions ce
left join ext_map m on m.old_id = ce.cle_ext_id
where m.set_id is null;

-- ── Produits : boosters et goodies ───────────────────────────────────────

create temp table old_products on commit drop as
select boo_id as id, boo_ext_id as ext_id, 'booster' as type, boo_description as description, boo_img as image,
       boo_obtained as obtained, boo_date as date_text, boo_sort_order as sort_order
from public.boosters where coalesce(boo_user_id, 'default') = 'default'
union all
select goo_id, goo_ext_id, coalesce(goo_product_type, 'autre'), goo_description, goo_img,
       goo_obtained, goo_date, goo_sort_order
from public.goodies where coalesce(goo_user_id, 'default') = 'default';

insert into v2.produits (id, set_id, type, description, image, obtained, obtained_on, sort_order)
select p.id, m.set_id,
       case when p.type in ('booster', 'etb', 'coffret', 'deck', 'premium', 'portfolio', 'autre') then p.type else 'autre' end,
       -- une date illisible reste lisible dans la description
       nullif(concat_ws(' · ', nullif(btrim(p.description), ''),
                 case when coalesce(p.date_text, '') <> '' and pg_temp.d(p.date_text) is null then 'date : ' || p.date_text end), ''),
       nullif(p.image, ''), coalesce(p.obtained, false), pg_temp.d(p.date_text), p.sort_order
from old_products p
left join ext_map m on m.old_id = p.ext_id;

insert into v2.migration_issues (source, source_id, probleme, detail)
select 'produits', p.id, 'extension perdue', coalesce(m.old_name, p.ext_id, '?') || ' : produit gardé sans extension'
from old_products p left join ext_map m on m.old_id = p.ext_id
where p.ext_id is not null and p.ext_id <> '' and m.set_id is null;

commit;

-- ── Rapport ──────────────────────────────────────────────────────────────

\echo
\echo '== Comptes avant / après'
select 'classeurs' as quoi, (select count(*) from public.classeurs) as avant, (select count(*) from v2.classeurs) as apres
union all select 'extensions rangées', (select count(*) from public.classeur_extensions), (select count(*) from v2.classeur_sets)
union all select 'produits', (select count(*) from public.boosters) + (select count(*) from public.goodies), (select count(*) from v2.produits)
union all select 'extensions personnalisées', (select count(*) from public.extensions), (select count(*) from v2.set_prefs);

\echo '== À vérifier (v2.migration_issues)'
select source, probleme, count(*), string_agg(distinct left(detail, 60), ' | ') as exemples
from v2.migration_issues where source in ('classeurs', 'produits', 'extensions')
group by 1, 2 order by 1, 2;

notify pgrst, 'reload schema';
