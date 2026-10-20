-- Compléments repris de l'ancienne appli, après la bascule :
--  · les personnages, objets, lieux et énergies (Édition › Encyclopédies) ;
--  · la couleur des blocs, que les extensions sans couleur à elles reprennent.
-- N'efface rien : ajoute seulement ce qui manque dans la v2. Rejouable.
-- psql -U pi_admin -d ptcg -f 013_reprise_complements.sql

set search_path = v2, public;
\set ON_ERROR_STOP on

do $$
declare
  n_entites int := 0;
  n_blocs int := 0;
begin
  if to_regclass('public.perso_objets') is not null then
    insert into v2.entites (id, kind, name, image, sort_order)
    select distinct on (o.pko_kind, btrim(o.pko_display_name))
           o.pko_id, o.pko_kind, btrim(o.pko_display_name), nullif(o.pko_image_url, ''), o.pko_sort_order
    from public.perso_objets o
    where coalesce(o.pko_user_id, 'default') = 'default'
      and not coalesce(o.pko_is_deleted, false)
      and o.pko_kind in ('personnage', 'objet', 'lieu', 'energie')
      and coalesce(btrim(o.pko_display_name), '') <> ''
    order by o.pko_kind, btrim(o.pko_display_name), o.pko_sort_order nulls last
    on conflict do nothing;
    get diagnostics n_entites = row_count;
  end if;

  if to_regclass('public.blocs') is not null then
    -- extension de l'ancienne appli → extension TCGdex (même règle que 012)
    create temp table ext_map on commit drop as
    select e.ext_id as old_id, e.ext_bloc_id as bloc_id,
           coalesce(
             (select s.id from public.set_mapping m join v2.sets s on s.id = m.stm_tcgdex_set_id where m.stm_ptcg_ext_id = e.ext_id limit 1),
             (select s.id from v2.sets s where v2.norm(s.name) = v2.norm(e.ext_nom) order by s.source = 'tcgdex' desc limit 1),
             (select s.id from v2.sets s where lower(s.id) = lower(nullif(e.ext_code, '')) limit 1)
           ) as set_id
    from public.extensions e
    where coalesce(e.ext_user_id, 'default') = 'default';

    -- couleur d'un bloc TCGdex : celle du bloc de l'ancienne appli du même nom,
    -- sinon celle qui revient le plus parmi les anciens blocs de ses extensions
    insert into v2.set_prefs (kind, target_id, color)
    select 'serie', se.id, coalesce(
      (select b.blo_couleur from public.blocs b
        where v2.norm(b.blo_nom) = v2.norm(se.name) and coalesce(b.blo_couleur, '') <> '' limit 1),
      (select b.blo_couleur
         from ext_map m
         join v2.sets s on s.id = m.set_id
         join public.blocs b on b.blo_id = m.bloc_id
        where s.serie_id = se.id and coalesce(b.blo_couleur, '') <> ''
        group by b.blo_couleur order by count(*) desc limit 1))
    from v2.series se
    where coalesce(
      (select b.blo_couleur from public.blocs b
        where v2.norm(b.blo_nom) = v2.norm(se.name) and coalesce(b.blo_couleur, '') <> '' limit 1),
      (select b.blo_couleur
         from ext_map m
         join v2.sets s on s.id = m.set_id
         join public.blocs b on b.blo_id = m.bloc_id
        where s.serie_id = se.id and coalesce(b.blo_couleur, '') <> ''
        group by b.blo_couleur order by count(*) desc limit 1)) is not null
    on conflict (kind, target_id) do update set color = excluded.color
      where v2.set_prefs.color is null;
    get diagnostics n_blocs = row_count;
  end if;

  raise notice '% fiche(s) personnage/objet/lieu/énergie reprise(s), % bloc(s) avec une couleur', n_entites, n_blocs;
end $$;

\echo '== Fiches par catégorie'
select kind, count(*) from v2.entites group by kind order by kind;

notify pgrst, 'reload schema';
