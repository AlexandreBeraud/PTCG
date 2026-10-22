-- PTCG v2 — Encyclopédie : fiches calculées automatiquement (personnages,
-- supporters, objets, lieux, énergies) à la place des fiches saisies à la main.
-- Rejouable. psql -U pi_admin -d ptcg -f 015_encyclopedie.sql

set search_path = v2, public;

-- ── Tables ───────────────────────────────────────────────────────────────

-- une fiche : « personnage:cynthia », « objet:poke ball », « energie:type:feu »…
create table if not exists v2.fiches (
  key      text primary key,
  kind     text not null check (kind in ('personnage', 'supporter', 'objet', 'lieu', 'energie')),
  name     text not null,
  cartes   int not null default 0,
  card_id  text,          -- carte la plus récente, pour l'image de repli
  search   text not null default ''
);
create index if not exists fiches_kind_idx on v2.fiches (kind);

-- une carte peut être sur deux fiches (« Barbara et Néphie »)
create table if not exists v2.carte_fiche (
  card_id    text not null references v2.cards(id) on delete cascade,
  fiche_key  text not null,
  rang       smallint not null default 0,
  primary key (card_id, fiche_key)
);
create index if not exists carte_fiche_fiche_idx on v2.carte_fiche (fiche_key);

-- retouches à la main, rejouées après chaque calcul
--   nom     : fiche_key renommée en valeur
--   onglet  : fiche_key passe dans l'onglet valeur
--   fusion  : fiche_key rejoint la fiche valeur
--   retirer / ajouter : card_id quitte / rejoint fiche_key (valeur = nom de la fiche)
create table if not exists v2.fiche_retouches (
  id         bigserial primary key,
  action     text not null check (action in ('nom', 'onglet', 'fusion', 'retirer', 'ajouter')),
  fiche_key  text not null,
  valeur     text,
  card_id    text references v2.cards(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists fiche_retouches_fiche_idx on v2.fiche_retouches (fiche_key);


-- ── Noms ─────────────────────────────────────────────────────────────────

-- « Ordres du Boss (Giovanni) » → « Ordres du Boss », « Prof.Orme » → « Professeur Orme »,
-- « Lysandre ◇ » → « Lysandre »
create or replace function v2.fiche_clean(t text) returns text
  language sql immutable parallel safe
  as $$
    select btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      translate(coalesce(t, ''), '’‘ʼ´`', ''''''''''''),
      '\s*\([^)]*\)', '', 'g'),
      '\s*(◇|\?|ACE SPEC|\{\*\})\s*$', '', 'i'),
      '\m(prof\.\s*|professeure?\s+)', 'Professeur ', 'gi'),
      '\s+', ' ', 'g'))
  $$;

create or replace function v2.fiche_slug(t text) returns text
  language sql immutable parallel safe
  as $$ select nullif(btrim(regexp_replace(v2.norm(v2.fiche_clean(t)), '[^a-z0-9]+', ' ', 'g')), '') $$;

-- À qui est la carte : « Ambition de Cynthia » → {Ambition, Cynthia},
-- « Mars de la Team Galaxie » → {Mars, Team Galaxie}. Les régions (« Goupix d'Alola »)
-- et les noms communs (« Gardien de la forêt ») ne comptent pas.
create or replace function v2.fiche_owner(t text) returns text[]
  language plpgsql immutable parallel safe
  as $$
  declare
    c text := v2.fiche_clean(t);
    m text[];
    y text;
  begin
    c := regexp_replace(regexp_replace(c, '-(ex|EX|GX)\M', '', 'g'), '\s(V|VMAX|VSTAR|GX|EX|ex|Radieux)$', '');
    m := regexp_match(c, '^(.*\S)\s(?:de la (Team .+)|de l''.+|du (.+)|de (.+)|d''(.+))$');
    if m is null then return null; end if;
    y := coalesce(m[2], m[3], m[4], m[5]);
    if y is null or y !~ '^[[:upper:]]'
       or v2.fiche_slug(y) ~ '^(kanto|johto|hoenn|sinnoh|unys|kalos|alola|galar|hisui|paldea|holon|pokemon)$' then
      return null;
    end if;
    return array[m[1], y];
  end
  $$;

-- Type d'une énergie de base (« Énergie Feu de base », « Basic Fire Energy »), sinon null
create or replace function v2.energie_type_mot(m text) returns text
  language sql immutable parallel safe
  as $$
    select case m
      when 'plante' then 'Plante' when 'grass' then 'Plante'
      when 'feu' then 'Feu' when 'fire' then 'Feu'
      when 'eau' then 'Eau' when 'water' then 'Eau'
      when 'electrique' then 'Électrique' when 'electrik' then 'Électrique' when 'lightning' then 'Électrique'
      when 'psy' then 'Psy' when 'psychic' then 'Psy'
      when 'combat' then 'Combat' when 'fighting' then 'Combat'
      when 'obscurite' then 'Obscurité' when 'darkness' then 'Obscurité'
      when 'metal' then 'Métal'
      when 'fee' then 'Fée' when 'fairy' then 'Fée'
      when 'dragon' then 'Dragon'
      when 'incolore' then 'Incolore' when 'colorless' then 'Incolore'
    end
  $$;
create or replace function v2.energie_type(name text, name_en text) returns text
  language sql immutable parallel safe
  as $$
    select coalesce(
      v2.energie_type_mot(substring(v2.fiche_slug(name) from '^energie (\S+)(?: de base)?$')),
      v2.energie_type_mot(substring(v2.fiche_slug(name_en) from '^(?:basic )?(\S+) energy$')))
  $$;


-- ── Calcul ───────────────────────────────────────────────────────────────

-- Recalcule toutes les fiches puis rejoue les retouches. Lancé par le job de nuit,
-- le bouton des Réglages et chaque retouche.
create or replace function v2.refresh_fiches() returns int
  language plpgsql security definer
  set search_path = v2, public
  as $$
  declare
    r record;
    hit text[];
    n int;
  begin
    -- 1. les cartes Dresseur et Énergie
    create temp table _c on commit drop as
    select c.id, c.name, c.lang, c.subtype, s.release_date,
           case v2.famille(c.category, c.subtype) when 'supporter' then 'supporter' when 'stade' then 'lieu'
                                                   when 'energie' then 'energie' else 'objet' end as kind,
           v2.fiche_slug(c.name) as kfr, v2.fiche_slug(c.name_en) as ken, v2.fiche_clean(c.name) as clean,
           case when c.category = 'energy' then v2.energie_type(c.name, c.name_en) end as etype,
           null::text as gkey
    from v2.cards c
    join v2.sets s on s.id = c.set_id
    where c.category in ('trainer', 'energy');

    -- 2. même carte = même nom français ou même nom anglais (« Poké Ball » / « Poké Balle ») ;
    --    énergies de base par type
    update _c set gkey = 'type:' || v2.fiche_slug(etype) where etype is not null;
    create temp table _p on commit drop as
    select distinct kind, kfr, ken, kfr as g from _c where gkey is null and kfr is not null;
    loop
      update _p p set g = m.g
      from (select kind, ken, min(g) as g from _p where ken is not null group by kind, ken) m
      where p.kind = m.kind and p.ken = m.ken and p.g > m.g;
      get diagnostics n = row_count;
      update _p p set g = m.g
      from (select kind, kfr, min(g) as g from _p group by kind, kfr) m
      where p.kind = m.kind and p.kfr = m.kfr and p.g > m.g;
      exit when n = 0 and not found;
    end loop;
    update _c c set gkey = p.g
    from _p p
    where c.gkey is null and p.kind = c.kind and p.kfr = c.kfr and p.ken is not distinct from c.ken;
    delete from _c where gkey is null;

    create temp table _g on commit drop as
    select kind, gkey,
           coalesce('Énergie ' || min(etype),
                    mode() within group (order by clean) filter (where lang = 'fr'),
                    mode() within group (order by clean)) as name,
           bool_and(subtype is null) as sans_type
    from _c group by kind, gkey;

    -- 3. les personnages : un nom qui revient sur au moins deux cartes, ou qui a un Pokémon
    create temp table _occ (slug text, name text, src text, team boolean not null default false) on commit drop;
    insert into _occ
    select v2.fiche_slug(x.o[2]), x.o[2], g.gkey
    from _g g, lateral (select v2.fiche_owner(g.name) as o) x
    where g.kind = 'supporter' and x.o is not null;
    insert into _occ   -- « Mars de la Team Galaxie » compte aussi pour Mars (pas tout seul : « Sbire »)
    select v2.fiche_slug(x.o[1]), x.o[1], g.gkey, true
    from _g g, lateral (select v2.fiche_owner(g.name) as o) x
    where g.kind = 'supporter' and x.o[2] ~ '^Team ' and x.o[1] ~ '^[[:upper:]]\S*$';
    insert into _occ
    select v2.fiche_slug(p), p, g.gkey
    from _g g, regexp_split_to_table(g.name, ', | et ') p
    where g.kind = 'supporter' and v2.fiche_owner(g.name) is null and g.name ~ ' et |, ';
    insert into _occ
    select v2.fiche_slug(g.name), g.name, g.gkey
    from _g g
    where g.kind = 'supporter' and v2.fiche_owner(g.name) is null and g.name !~ ' et |, ';

    create temp table _poke on commit drop as
    select distinct v2.fiche_slug((v2.fiche_owner(name))[2]) as slug
    from v2.cards
    where category = 'pokemon' and name ~ '\s(de |du |d'')';

    create temp table _ok on commit drop as
    select o.slug, mode() within group (order by o.name) as name
    from _occ o
    where o.slug is not null
    group by o.slug
    having bool_or(not o.team) and (o.slug ~ '^professeur [a-z]'
        or ((count(distinct o.src) >= 2 or o.slug in (select slug from _poke where slug is not null))
            and o.slug !~ '^(team|les?|la)( |$)')
        or (o.slug ~ '^team ' and count(distinct o.src) >= 2));
    create unique index on _ok (slug);

    -- 4. chaque groupe de cartes va sur sa fiche
    create temp table _a (kind text, gkey text, fkey text, fname text, rang int) on commit drop;
    for r in select * from _g where kind = 'supporter' loop
      hit := null;
      -- « Barbara et Néphie » : les deux
      if r.name ~ ' et |, ' then
        select array_agg(k.slug order by k.ord) into hit
        from (select v2.fiche_slug(p) as slug, ord from regexp_split_to_table(r.name, ', | et ') with ordinality t(p, ord)) k
        where k.slug in (select slug from _ok);
      end if;
      -- « Giovanni de la Team Rocket », « Timmy au dressage » : le personnage en tête
      if hit is null then
        select array[v2.fiche_slug(h)] into hit
        from (select array_to_string((string_to_array(v2.fiche_clean(r.name), ' '))[1:i], ' ') as h, i
              from generate_series(array_length(string_to_array(v2.fiche_clean(r.name), ' '), 1) - 1, 1, -1) i) w
        where h !~ '^Team' and v2.fiche_slug(h) in (select slug from _ok)
        order by i desc limit 1;
      end if;
      -- « Ambition de Cynthia »
      if hit is null and v2.fiche_slug((v2.fiche_owner(r.name))[2]) in (select slug from _ok) then
        hit := array[v2.fiche_slug((v2.fiche_owner(r.name))[2])];
      end if;
      -- « Cynthia » toute seule
      if hit is null and v2.fiche_slug(r.name) in (select slug from _ok) then
        hit := array[v2.fiche_slug(r.name)];
      end if;

      if hit is null then
        insert into _a values ('supporter', r.gkey, 'supporter:' || r.gkey, r.name, 0);
      else
        insert into _a select 'supporter', r.gkey, 'personnage:' || s, k.name, o::int
        from unnest(hit) with ordinality u(s, o) join _ok k on k.slug = u.s;
      end if;
    end loop;

    -- vieilles cartes sans type (« Professeur Chen » du set de base) : chez le personnage
    insert into _a
    select g.kind, g.gkey, coalesce('personnage:' || k.slug, g.kind || ':' || g.gkey), coalesce(k.name, g.name), 0
    from _g g
    left join _ok k on g.sans_type and g.kind = 'objet' and k.slug = v2.fiche_slug(g.name)
    where g.kind <> 'supporter';

    create temp table _cf on commit drop as
    select c.id as card_id, a.fkey as fiche_key, a.fkey as orig_key, a.fname as fiche_name, a.rang,
           c.kind || ':' || c.gkey as base_key, c.gkey
    from _c c join _a a on a.kind = c.kind and a.gkey = c.gkey;

    -- 5. retouches
    for r in select * from v2.fiche_retouches where action = 'onglet' order by id loop
      update _cf set fiche_key = r.valeur || substr(fiche_key, strpos(fiche_key, ':')) where fiche_key = r.fiche_key;
    end loop;
    for i in 1..10 loop
      update _cf c set fiche_key = rt.valeur
      from v2.fiche_retouches rt
      where rt.action = 'fusion' and rt.fiche_key = c.fiche_key and rt.valeur <> c.fiche_key;
      exit when not found;
    end loop;
    delete from _cf c using v2.fiche_retouches rt
    where rt.action = 'retirer' and rt.card_id = c.card_id and rt.fiche_key = c.fiche_key;
    -- une carte retirée de partout retourne sur sa fiche de base (souvent les Supporters)
    insert into _cf
    select distinct on (c.id) c.id, c.kind || ':' || c.gkey, c.kind || ':' || c.gkey, g.name, 0, c.kind || ':' || c.gkey, c.gkey
    from _c c join _g g on g.kind = c.kind and g.gkey = c.gkey
    where not exists (select 1 from _cf x where x.card_id = c.id)
      and not exists (select 1 from v2.fiche_retouches rt where rt.action = 'retirer' and rt.card_id = c.id and rt.fiche_key = c.kind || ':' || c.gkey);
    insert into _cf
    select rt.card_id, rt.fiche_key, rt.fiche_key, coalesce(rt.valeur, rt.fiche_key), 9, null, null
    from v2.fiche_retouches rt
    where rt.action = 'ajouter' and exists (select 1 from v2.cards c where c.id = rt.card_id);

    -- 6. on remplace
    delete from v2.carte_fiche;
    insert into v2.carte_fiche (card_id, fiche_key, rang)
    select card_id, fiche_key, min(rang) from _cf group by card_id, fiche_key;

    delete from v2.fiches;
    insert into v2.fiches (key, kind, name, cartes, card_id, search)
    select x.fiche_key,
           split_part(x.fiche_key, ':', 1),
           coalesce((select rt.valeur from v2.fiche_retouches rt where rt.action = 'nom' and rt.fiche_key = x.fiche_key order by rt.id desc limit 1),
                    mode() within group (order by x.fiche_name) filter (where x.orig_key = x.fiche_key),
                    mode() within group (order by x.fiche_name)),
           count(distinct x.card_id),
           (array_agg(c.id order by (coalesce(c.image_manual, c.image, c.image_fallback) is null), s.release_date desc nulls last, c.id))[1],
           ' ' || string_agg(distinct coalesce(v2.fiche_slug(x.fiche_name), '') || ' ' || coalesce(v2.fiche_slug(c.name), ''), ' ') || ' '
    from _cf x
    join v2.cards c on c.id = x.card_id
    join v2.sets s on s.id = c.set_id
    where split_part(x.fiche_key, ':', 1) in ('personnage', 'supporter', 'objet', 'lieu', 'energie')
    group by x.fiche_key;
    get diagnostics n = row_count;
    delete from v2.carte_fiche cf where not exists (select 1 from v2.fiches f where f.key = cf.fiche_key);
    -- le nom retouché compte aussi pour la recherche
    update v2.fiches f set search = f.search || coalesce(v2.fiche_slug(f.name), '') || ' ';
    return n;
  end
  $$;


-- Une retouche depuis la fiche, puis recalcul. Renvoie la clé où aller ensuite.
create or replace function v2.fiche_retouche(action text, fiche text, valeur text default null, carte text default null)
returns text
  language plpgsql security definer
  set search_path = v2, public
  as $$
  #variable_conflict use_variable
  declare
    cible text;
    old_id bigint;
  begin
    if action = 'nom' then
      delete from v2.fiche_retouches r where r.action = 'nom' and r.fiche_key = fiche;
      if nullif(btrim(valeur), '') is not null then
        insert into v2.fiche_retouches (action, fiche_key, valeur) values ('nom', fiche, btrim(valeur));
      end if;
      cible := fiche;

    elsif action = 'onglet' then
      cible := valeur || substr(fiche, strpos(fiche, ':'));
      -- déjà déplacée ? on modifie la retouche d'origine
      select r.id into old_id from v2.fiche_retouches r
      where r.action = 'onglet' and r.valeur || substr(r.fiche_key, strpos(r.fiche_key, ':')) = fiche;
      if old_id is not null then
        update v2.fiche_retouches r set valeur = valeur where r.id = old_id;
        delete from v2.fiche_retouches r where r.id = old_id and split_part(r.fiche_key, ':', 1) = r.valeur;
      else
        insert into v2.fiche_retouches (action, fiche_key, valeur) values ('onglet', fiche, valeur);
      end if;
      update v2.fiche_retouches r set fiche_key = cible where r.fiche_key = fiche and r.action <> 'onglet';
      update v2.fiche_retouches r set valeur = cible where r.action = 'fusion' and r.valeur = fiche;

    elsif action = 'fusion' then
      if valeur = fiche then raise exception 'Une fiche ne peut pas fusionner avec elle-même'; end if;
      insert into v2.fiche_retouches (action, fiche_key, valeur) values ('fusion', fiche, valeur);
      update v2.fiche_retouches r set valeur = valeur where r.action = 'fusion' and r.valeur = fiche;
      update v2.fiche_retouches r set fiche_key = valeur where r.action = 'ajouter' and r.fiche_key = fiche;
      delete from v2.fiche_retouches r where r.action = 'nom' and r.fiche_key = fiche;
      cible := valeur;

    elsif action = 'retirer' then
      delete from v2.fiche_retouches r where r.action = 'ajouter' and r.fiche_key = fiche and r.card_id = carte;
      if not found then
        insert into v2.fiche_retouches (action, fiche_key, card_id) values ('retirer', fiche, carte);
      end if;
      cible := fiche;

    elsif action = 'ajouter' then
      delete from v2.fiche_retouches r where r.action = 'retirer' and r.fiche_key = fiche and r.card_id = carte;
      if not found then
        insert into v2.fiche_retouches (action, fiche_key, valeur, card_id)
        values ('ajouter', fiche, (select f.name from v2.fiches f where f.key = fiche), carte);
      end if;
      cible := fiche;

    elsif action = 'annuler' then
      -- toutes les retouches de cette fiche : elle revient telle que calculée
      select r.fiche_key into cible from v2.fiche_retouches r
      where r.action = 'onglet' and r.valeur || substr(r.fiche_key, strpos(r.fiche_key, ':')) = fiche;
      delete from v2.fiche_retouches r
      where r.fiche_key = fiche
         or (r.action = 'fusion' and r.valeur = fiche)
         or (r.action = 'onglet' and r.valeur || substr(r.fiche_key, strpos(r.fiche_key, ':')) = fiche);
      cible := coalesce(cible, fiche);

    else
      raise exception 'Retouche inconnue : %', action;
    end if;

    perform v2.refresh_fiches();
    return cible;
  end
  $$;


-- ── Lecture ──────────────────────────────────────────────────────────────

create or replace view v2.fiche_list with (security_invoker = true) as
select f.key, f.kind, f.name, f.cartes, f.search, f.card_id,
       coalesce(c.image_manual, c.image, c.image_fallback) as image,
       coalesce((select sum(st.en_stock) from v2.carte_fiche cf join v2.card_stats st on st.card_id = cf.card_id
                 where cf.fiche_key = f.key), 0)::bigint as en_stock,
       (select count(*) from v2.fiche_retouches r
        where r.fiche_key = f.key or (r.action = 'fusion' and r.valeur = f.key)
           or (r.action = 'onglet' and r.valeur || substr(r.fiche_key, strpos(r.fiche_key, ':')) = f.key))::int as retouches
from v2.fiches f
left join v2.cards c on c.id = f.card_id;

create or replace view v2.fiche_card_list with (security_invoker = true) as
select cf.fiche_key, l.*
from v2.carte_fiche cf
join v2.card_list l on l.id = cf.card_id;

-- même signature : seuls les onglets autres que Pokémon changent
create or replace function v2.picker_entities(kind text, q text default null, lim int default 40)
returns table (type text, key text, name text, image text, sprite text, pokeapi_id int, form_badge text, form_color text,
               dex int, tokens text, cartes bigint, en_stock bigint)
  language plpgsql stable
  as $$
  #variable_conflict use_column
  declare
    nq text := btrim(regexp_replace(v2.norm(coalesce(q, '')), '[^a-z0-9]+', ' ', 'g'));
  begin
    if kind = 'pokemon' then
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
      select 'fiche'::text, f.key, f.name, f.image, null::text, null::int, null::text, null::text, null::int,
             null::text, f.cartes::bigint, f.en_stock
      from v2.fiche_list f
      where f.kind = picker_entities.kind
        and (nq = '' or f.search like '% ' || nq || '%')
      order by v2.norm(f.name)
      limit lim;
  end
  $$;


-- ── Ventes et achats : la fiche de la carte ─────────────────────────────

create or replace view v2.transaction_list with (security_invoker = true) as
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
  s.release_date as set_release,
  se.name as serie_name,
  v2.number_sort(c.number) as number_sort,
  coalesce(sp.color, spp.color) as set_color,
  c.price_low_holo,
  fi.key as fiche_key,
  fi.kind as fiche_kind,
  fi.name as fiche_name
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
left join v2.labels l on l.enabled and l.type = case when pl.pokemon_key is not null then pl.label_type else p.form_type end
left join lateral (
  select x.key, x.kind, x.name from v2.carte_fiche cf join v2.fiches x on x.key = cf.fiche_key
  where cf.card_id = t.card_id
  order by cf.rang, x.key
  limit 1
) fi on c.category in ('trainer', 'energy');


-- ── Les anciennes fiches disparaissent ───────────────────────────────────

drop table if exists v2.entites;


-- ── Droits ───────────────────────────────────────────────────────────────

grant select on v2.fiches, v2.carte_fiche, v2.fiche_retouches, v2.fiche_list, v2.fiche_card_list to anon, ptcg_job;
grant execute on function v2.refresh_fiches(), v2.fiche_retouche(text, text, text, text) to anon, ptcg_job;
grant execute on function v2.fiche_clean(text), v2.fiche_slug(text), v2.fiche_owner(text),
  v2.energie_type(text, text), v2.energie_type_mot(text) to anon, ptcg_job;

select v2.refresh_fiches() as fiches;

notify pgrst, 'reload schema';
