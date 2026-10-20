-- PTCG v2 — sélecteur de carte : tout le Pokédex ; ordre des blocs choisi à la main
-- dans les menus d'extensions. Rejouable. psql -U pi_admin -d ptcg -f 008_blocs_selecteur.sql

set search_path = v2, public;

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
      -- tout le Pokédex (les fiches qui ont des cartes), dans son ordre
      return query
        select 'pokemon'::text, p.key, p.name_fr, null::text, p.sprite, p.pokeapi_id, p.form_badge, p.form_color,
               p.dex, null::text, p.cartes::bigint, p.en_stock::bigint
        from v2.pokedex p
        where p.cartes > 0
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

-- Menus d'extensions : les blocs dans l'ordre choisi dans Réglages, sinon du plus récent au plus ancien
drop view if exists v2.set_options;
create view v2.set_options with (security_invoker = true) as
select s.id, s.name, s.release_date, s.serie_id, coalesce(se.name, 'Hors bloc') as serie_name,
       max(s.release_date) over (partition by s.serie_id) as serie_release,
       sp.sort_order as serie_sort,
       s.source, s.lang, s.symbol, s.card_count, s.card_count_total
from v2.sets s
left join v2.series se on se.id = s.serie_id
left join v2.set_prefs sp on sp.kind = 'serie' and sp.target_id = s.serie_id;

grant select on v2.set_options to anon, ptcg_job;
grant execute on function v2.picker_entities(text, text, int) to anon;

notify pgrst, 'reload schema';
