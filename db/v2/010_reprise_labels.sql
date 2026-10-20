-- Reprise des labels de formes depuis l'ancien schéma public, à l'identique.
-- Rejouable : remplace à chaque fois le contenu des tables v2 correspondantes.
-- Tant que la bascule n'est pas faite, l'ancienne appli reste la référence.

set search_path = v2, public;

begin;

truncate v2.pokemon_labels, v2.labels, v2.label_categories cascade;

insert into v2.label_categories (id, name, parent_id, hidden, sort_order)
select lab_id, coalesce(nullif(lab_name, ''), lab_id), nullif(lab_parent_id, ''), coalesce(lab_is_hidden, false), lab_sort_order
from public.label_categories;

-- les préfixes/suffixes sont en jsonb dans public, en text[] ici
insert into v2.labels (type, name_fr, badge, color, enabled, prefixes, suffixes, category_id, sort_order)
select l.lbl_type,
       coalesce(nullif(l.lbl_fr, ''), l.lbl_type),
       nullif(l.lbl_badge, ''),
       nullif(l.lbl_color, ''),
       coalesce(l.lbl_enabled, true),
       case when jsonb_typeof(l.lbl_prefixes) = 'array' then array(select jsonb_array_elements_text(l.lbl_prefixes)) else '{}' end,
       case when jsonb_typeof(l.lbl_suffixes) = 'array' then array(select jsonb_array_elements_text(l.lbl_suffixes)) else '{}' end,
       (select c.id from v2.label_categories c where c.id = l.lbl_category_id),
       l.lbl_sort_order
from public.labels l;

insert into v2.pokemon_labels (pokemon_key, label_type)
select a.pok_pokemon_key, nullif(a.pok_label_id, '')
from public.pokemon_label_assignments a
where nullif(a.pok_label_id, '') is null
   or exists (select 1 from v2.labels l where l.type = a.pok_label_id);

commit;

select (select count(*) from v2.label_categories) as categories,
       (select count(*) from v2.labels) as labels,
       (select count(*) from v2.pokemon_labels) as attributions;

select v2.refresh_card_forms();
