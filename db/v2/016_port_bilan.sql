-- PTCG v2 — Bilan : les frais de port sont toujours dans mon bilan, même
-- quand la commande est pour le compte de quelqu'un d'autre.
-- Rejouable. psql -U pi_admin -d ptcg -f 016_port_bilan.sql

set search_path = v2, public;

-- Mêmes règles qu'avant, sauf le port d'une vente : il compte dans mes revenus
-- (case « payé » décochée), au mois d'arrivée, quel que soit le compte.
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
    where scope is null and o.direction = 'vente' and o.status = 'arrive' and o.shipping > 0 and not o.shipping_paid
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

notify pgrst, 'reload schema';
