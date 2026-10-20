-- Reprise des ventes, dépenses, contacts, commandes et accessoires de l'ancienne appli.
-- Rejouable : vide ces tables dans v2 puis les recharge depuis public.
-- Tant que la bascule n'est pas faite, l'ancienne appli reste la référence :
-- une saisie faite entre-temps est reprise en relançant ce script.
--
-- À la fin : comptes avant/après, Bilan mois par mois ancien/nouveau, et les
-- lignes à vérifier dans v2.migration_issues.

set search_path = v2, public;
\set ON_ERROR_STOP on

create table if not exists v2.migration_issues (
  source     text not null,
  source_id  text not null,
  probleme   text not null,
  detail     text,
  created_at timestamptz not null default now()
);
grant select on v2.migration_issues to anon;

begin;

delete from v2.migration_issues where source in ('ventes', 'depenses', 'contacts', 'commandes');
delete from v2.transactions;
delete from v2.commandes;
delete from v2.contacts;
delete from v2.accessoires;
delete from v2.card_overrides where card_id in (select id from v2.cards where id like 'reprise-%');
delete from v2.cards where id like 'reprise-%';
delete from v2.sets where id = 'reprise-manuelles';

-- dates saisies en texte dans l'ancienne appli ('' ou AAAA-MM-JJ)
create or replace function pg_temp.d(t text) returns date language sql immutable as $$
  select case when t ~ '^\d{4}-\d{2}-\d{2}$' then t::date end $$;

create or replace function pg_temp.lang(t text) returns text language sql immutable as $$
  select case lower(coalesce(t, ''))
    when 'français' then 'FR' when 'francais' then 'FR' when 'anglais' then 'EN' when 'japonais' then 'JP'
    when 'allemand' then 'DE' when 'italien' then 'IT' when 'espagnol' then 'ES' when 'portugais' then 'PT'
    when 'néerlandais' then 'NL' when 'coréen' then 'KR' when 'chinois' then 'CN'
    when '' then null else upper(left(t, 2)) end $$;

-- une seule variante dans v2 : la plus « rare » des types cochés
create or replace function pg_temp.variant(types jsonb) returns text language sql immutable as $$
  select case
    when types ? 'reverse' then 'reverse'
    when types ? 'holo_cosmos' or types ? 'holo' then 'holo'
    when types ? '1ere_edition' then '1ere_edition'
    when types ? 'normale' then 'normale' end $$;

create or replace function pg_temp.crop(t text) returns smallint language sql immutable as $$
  select case
    when t ~ '^\d+(\.\d+)?$' then least(100, greatest(0, round(t::numeric)))::smallint
    when t = 'top' then 0 when t = 'bottom' then 100 else null end $$;


-- ── Contacts : acheteurs et vendeurs fusionnés par pseudo ────────────────

create temp table old_contacts on commit drop as
select 'vente' as role, ach_id as old_id, btrim(ach_pseudo) as pseudo, nullif(ach_icon, '') as icon, ach_created_at as created_at from public.acheteurs
union all
select 'achat', vnd_id, btrim(vnd_pseudo), nullif(vnd_icon, ''), vnd_created_at from public.vendeurs;

update old_contacts set pseudo = 'Sans nom ' || old_id where coalesce(pseudo, '') = '';

insert into v2.contacts (id, pseudo, icon, created_at)
select distinct on (pseudo) old_id, pseudo, icon, coalesce(created_at, now())
from old_contacts
order by pseudo, role desc, created_at;

create temp table contact_map on commit drop as
select oc.old_id, c.id as new_id from old_contacts oc join v2.contacts c on c.pseudo = oc.pseudo;

insert into v2.migration_issues (source, source_id, probleme, detail)
select 'contacts', oc.old_id, 'fusionné', oc.pseudo || ' existait comme acheteur et comme vendeur (ou en double) : un seul contact'
from old_contacts oc join contact_map m on m.old_id = oc.old_id where m.new_id <> oc.old_id;


-- ── Commandes ────────────────────────────────────────────────────────────

insert into v2.commandes (id, contact_id, direction, ordered_on, arrived_on, link, status, created_at)
select acc_id, m.new_id, 'vente', pg_temp.d(acc_date_achat), pg_temp.d(acc_date_arrivee), nullif(btrim(acc_lien_vente), ''),
       case acc_etat when 'envoye' then 'envoye' when 'envoyee' then 'envoye' when 'arrive' then 'arrive' else 'a_envoyer' end,
       coalesce(acc_created_at, now())
from public.acheteur_commandes left join contact_map m on m.old_id = acc_acheteur_id;

insert into v2.commandes (id, contact_id, direction, ordered_on, arrived_on, link, status, created_at)
select vco_id, m.new_id, 'achat', pg_temp.d(vco_date_achat), pg_temp.d(vco_date_arrivee), nullif(btrim(vco_lien_achat), ''),
       case vco_etat when 'paye' then 'paye' when 'payee' then 'paye' when 'arrive' then 'arrive' else 'a_payer' end,
       coalesce(vco_created_at, now())
from public.vendeur_commandes left join contact_map m on m.old_id = vco_vendeur_id;

insert into v2.migration_issues (source, source_id, probleme, detail)
select 'commandes', id, 'date illisible', 'date de commande ou d''arrivée non reconnue'
from (
  select acc_id as id, acc_date_achat as a, acc_date_arrivee as b from public.acheteur_commandes
  union all select vco_id, vco_date_achat, vco_date_arrivee from public.vendeur_commandes
) x
where (coalesce(a, '') <> '' and pg_temp.d(a) is null) or (coalesce(b, '') <> '' and pg_temp.d(b) is null);


-- ── Accessoires ──────────────────────────────────────────────────────────

insert into v2.accessoires (id, name, image)
select pko_id, coalesce(nullif(btrim(pko_display_name), ''), 'Accessoire'), nullif(pko_image_url, '')
from public.perso_objets
where pko_kind = 'accessoire' and not coalesce(pko_is_deleted, false);


-- ── Lignes de vente et d'achat ───────────────────────────────────────────

create temp table old_lines on commit drop as
select 'vente' as direction, ven_id as id, nullif(ven_commande_id, '') as commande_id,
       nullif(ven_card_id, '') as card_id, nullif(btrim(ven_card_name), '') as card_name, nullif(ven_card_image, '') as card_image,
       nullif(ven_set_id, '') as set_id, nullif(ven_number, '') as number, nullif(ven_rarity, '') as rarity,
       nullif(ven_pko_key, '') as pko_key, ven_etat as etat, ven_prix as prix, ven_qty as qty, ven_types as types,
       ven_langue as langue, ven_statut as statut, nullif(btrim(ven_pour_compte_de), '') as pour_compte_de,
       ven_crop as crop, nullif(ven_cardmarket_url, '') as cardmarket_url, ven_created_at as created_at
from public.ventes
union all
select 'achat', dep_id, nullif(dep_commande_id, ''),
       nullif(dep_card_id, ''), nullif(btrim(dep_card_name), ''), nullif(dep_card_image, ''),
       nullif(dep_set_id, ''), nullif(dep_number, ''), nullif(dep_rarity, ''),
       nullif(dep_pko_key, ''), dep_etat, dep_prix, dep_qty, dep_types,
       dep_langue, null, null, dep_crop, nullif(dep_cardmarket_url, ''), dep_created_at
from public.depenses;

alter table old_lines add column kind text, add column accessoire_id text, add column new_card text, add column resolution text;

update old_lines set kind = case
  when pko_key like 'lot:%' then 'lot'
  when pko_key like 'accessoire:%' then 'accessoire'
  else 'carte' end;
update old_lines l set accessoire_id = a.id
from v2.accessoires a where l.kind = 'accessoire' and a.id = substr(l.pko_key, 12);

-- 1. même id de carte dans le catalogue v2
update old_lines l set new_card = c.id, resolution = 'id'
from v2.cards c where l.kind = 'carte' and c.id = l.card_id;

-- 2. même extension (ou sa sous-extension TCGdex : swsh9 → swsh9tg) et même numéro
update old_lines l set new_card = x.id, resolution = 'numero'
from (
  select l2.id as line_id, min(c.id) as id, count(*) as n
  from old_lines l2
  join v2.cards c
    on (c.set_id = coalesce(l2.set_id, regexp_replace(l2.card_id, '-[^-]+$', ''))
        or c.set_id ~ ('^' || regexp_replace(coalesce(l2.set_id, regexp_replace(l2.card_id, '-[^-]+$', '')), '([.])', '\\\1', 'g') || '(tg|gg|sv)$'))
   and ltrim(lower(c.number), '0') = ltrim(lower(coalesce(l2.number, regexp_replace(l2.card_id, '^.*-', ''))), '0')
  where l2.kind = 'carte' and l2.new_card is null and (l2.card_id is not null or l2.set_id is not null)
  group by l2.id
) x
where l.id = x.line_id and x.n = 1;

-- 3. sinon : carte manuelle avec les infos recopiées (rangée dans son extension si elle existe)
insert into v2.sets (id, name, source, lang)
select 'reprise-manuelles', 'Cartes reprises à la main', 'manual', 'fr'
where exists (
  select 1 from old_lines l where l.kind = 'carte' and l.new_card is null
    and not exists (select 1 from v2.sets s where s.id = l.set_id)
);

insert into v2.cards (id, set_id, number, name, rarity, image, source, lang, cardmarket_url, cardmarket_url_manual)
select distinct on (key)
       'reprise-' || key,
       coalesce((select s.id from v2.sets s where s.id = l.set_id), 'reprise-manuelles'),
       l.number, coalesce(l.card_name, 'Carte sans nom'), l.rarity, l.card_image, 'manual', 'fr',
       l.cardmarket_url, l.cardmarket_url is not null
from (select *, coalesce(card_id, set_id || '-' || number, id) as key from old_lines where kind = 'carte' and new_card is null) l
order by key, created_at desc;

update old_lines l set new_card = 'reprise-' || coalesce(card_id, set_id || '-' || number, id), resolution = 'manuelle'
where kind = 'carte' and new_card is null;

insert into v2.migration_issues (source, source_id, probleme, detail)
select case direction when 'vente' then 'ventes' else 'depenses' end, id, 'carte manuelle',
       coalesce(card_name, '?') || ' (' || coalesce(card_id, nullif(concat_ws(' ', set_id, number), ''), 'sans référence') || ') introuvable dans TCGdex'
from old_lines where resolution = 'manuelle';

-- le lien Cardmarket collé à la main dans l'ancienne appli prime sur le lien généré
update v2.cards c set cardmarket_url = x.url, cardmarket_url_manual = true
from (
  select distinct on (new_card) new_card, cardmarket_url as url
  from old_lines where new_card is not null and cardmarket_url is not null order by new_card, created_at desc
) x
where c.id = x.new_card and c.source = 'tcgdex' and c.cardmarket_url is distinct from x.url;

insert into v2.migration_issues (source, source_id, probleme, detail)
select case direction when 'vente' then 'ventes' else 'depenses' end, id, 'valeur corrigée',
       concat_ws(', ',
         case when etat is not null and etat not in ('Mint', 'Near Mint', 'Excellent', 'Good', 'Light Played', 'Played', 'Poor', 'Neuf', 'Occasion') then 'état « ' || etat || ' » retiré' end,
         case when direction = 'vente' and coalesce(statut, 'a_mettre') not in ('a_mettre', 'en_vente', 'vendue', 'en_ligne') then 'statut « ' || statut || ' » → à mettre en vente' end,
         case when coalesce(qty, 0) < 1 then 'quantité ' || coalesce(qty::text, 'vide') || ' → 1' end,
         case when kind = 'accessoire' and accessoire_id is null then 'accessoire introuvable, repris comme produit' end)
from old_lines
where (etat is not null and etat not in ('Mint', 'Near Mint', 'Excellent', 'Good', 'Light Played', 'Played', 'Poor', 'Neuf', 'Occasion'))
   or (direction = 'vente' and coalesce(statut, 'a_mettre') not in ('a_mettre', 'en_vente', 'vendue', 'en_ligne'))
   or coalesce(qty, 0) < 1
   or (kind = 'accessoire' and accessoire_id is null);

insert into v2.transactions (id, direction, commande_id, kind, card_id, accessoire_id, set_id, label,
                             condition, variant, lang, price, qty, status, for_account, crop, created_at, updated_at)
select l.id, l.direction,
       (select o.id from v2.commandes o where o.id = l.commande_id),
       case when l.kind = 'accessoire' and l.accessoire_id is null then 'produit' else l.kind end,
       case when l.kind = 'carte' then l.new_card end,
       l.accessoire_id,
       case when l.kind <> 'carte' then (select s.id from v2.sets s where s.id = l.set_id) end,
       case when l.kind = 'lot' and l.card_name is distinct from 'Lot de cartes' then l.card_name
            when l.kind = 'accessoire' and l.accessoire_id is null then l.card_name end,
       case when l.etat in ('Mint', 'Near Mint', 'Excellent', 'Good', 'Light Played', 'Played', 'Poor', 'Neuf', 'Occasion') then l.etat end,
       case when l.kind = 'carte' then pg_temp.variant(l.types) end,
       pg_temp.lang(l.langue),
       l.prix,
       greatest(coalesce(l.qty, 1), 1),
       case when l.direction = 'vente' then
         case when l.statut in ('a_mettre', 'en_vente', 'vendue') then l.statut when l.statut = 'en_ligne' then 'en_vente' else 'a_mettre' end end,
       case when l.direction = 'vente' then l.pour_compte_de end,
       case when l.kind = 'carte' then pg_temp.crop(l.crop) end,
       coalesce(l.created_at, now()), now()
from old_lines l;

commit;

select v2.refresh_card_forms();


-- ── Rapport ──────────────────────────────────────────────────────────────

\echo
\echo '== Comptes avant / après'
select 'contacts' as quoi, (select count(*) from public.acheteurs) + (select count(*) from public.vendeurs) as avant, (select count(*) from v2.contacts) as apres
union all select 'commandes', (select count(*) from public.acheteur_commandes) + (select count(*) from public.vendeur_commandes), (select count(*) from v2.commandes)
union all select 'ventes', (select count(*) from public.ventes), (select count(*) from v2.transactions where direction = 'vente')
union all select 'dépenses', (select count(*) from public.depenses), (select count(*) from v2.transactions where direction = 'achat')
union all select 'accessoires', (select count(*) from public.perso_objets where pko_kind = 'accessoire' and not coalesce(pko_is_deleted, false)), (select count(*) from v2.accessoires);

\echo '== Cartes retrouvées'
select resolution, count(*) from (
  select case when t.card_id like 'reprise-%' then 'carte manuelle' when t.card_id is not null then 'catalogue TCGdex' else t.kind end as resolution
  from v2.transactions t
) x group by 1 order by 2 desc;

\echo '== Bilan mois par mois : ancienne appli / nouvelle (les écarts seulement)'
-- calcul de l'ancienne appli (renderBilan) : vendue + commande arrivée, mois de la date
-- d'arrivée (ventes) ou de commande (achats), sinon de la saisie ; une date illisible
-- faisait sortir la ligne du Bilan
create temp view old_bilan as
select mois, sum(v) as ventes, sum(a) as achats from (
  select case when coalesce(c.acc_date_arrivee, '') = '' then date_trunc('month', (v.ven_created_at at time zone 'Europe/Paris')::date)
              else date_trunc('month', pg_temp.d(c.acc_date_arrivee)) end::date as mois,
         case when v.ven_pko_key like 'lot:%' then coalesce(v.ven_prix, 0)
              else coalesce(v.ven_prix, 0) * case when coalesce(v.ven_qty, 0) = 0 then 1 else v.ven_qty end end as v,
         0 as a
  from public.ventes v
  join public.acheteur_commandes c on c.acc_id = v.ven_commande_id
  where v.ven_statut = 'vendue' and coalesce(c.acc_etat, 'a_envoyer') = 'arrive' and coalesce(v.ven_pour_compte_de, '') = ''
  union all
  select case when coalesce(c.vco_date_achat, '') = '' then date_trunc('month', (d.dep_created_at at time zone 'Europe/Paris')::date)
              else date_trunc('month', pg_temp.d(c.vco_date_achat)) end::date,
         0,
         case when d.dep_pko_key like 'lot:%' then coalesce(d.dep_prix, 0)
              else coalesce(d.dep_prix, 0) * case when coalesce(d.dep_qty, 0) = 0 then 1 else d.dep_qty end end
  from public.depenses d
  join public.vendeur_commandes c on c.vco_id = d.dep_commande_id
  where coalesce(c.vco_etat, 'a_payer') = 'arrive'
) x
where mois is not null
group by mois;

create temp view bilan_cmp as
select coalesce(o.mois, n.mois) as mois,
       coalesce(o.ventes, 0) as ventes_avant, coalesce(n.ventes, 0) as ventes_apres,
       coalesce(o.achats, 0) as achats_avant, coalesce(n.achats, 0) as achats_apres
from old_bilan o full join v2.bilan_mensuel(null) n on n.mois = o.mois;

select to_char(mois, 'YYYY-MM') as mois, ventes_avant, ventes_apres, achats_avant, achats_apres
from bilan_cmp
where round(ventes_avant, 2) <> round(ventes_apres, 2) or round(achats_avant, 2) <> round(achats_apres, 2)
order by mois;

select case when count(*) = 0 then 'Bilan identique sur tous les mois (' || (select count(*) from bilan_cmp) || ' mois).'
            else count(*) || ' mois diffèrent : voir ci-dessus et v2.migration_issues.' end as verdict
from bilan_cmp
where round(ventes_avant, 2) <> round(ventes_apres, 2) or round(achats_avant, 2) <> round(achats_apres, 2);

\echo '== À vérifier (v2.migration_issues)'
select source, probleme, count(*) from v2.migration_issues group by 1, 2 order by 1, 2;

notify pgrst, 'reload schema';
