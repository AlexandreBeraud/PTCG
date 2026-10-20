-- Bascule : la nouvelle appli devient la référence.
-- Les reprises (010, 011, 012) refusent désormais de tourner, et l'ancienne
-- appli passe en lecture seule pour qu'aucune saisie ne s'y perde.
-- Retour arrière : 021_retour.sql

\set ON_ERROR_STOP on

create table if not exists v2.bascule (done_at timestamptz primary key default now());
insert into v2.bascule default values on conflict do nothing;

revoke insert, update, delete, truncate on all tables in schema public from anon;

select 'Bascule enregistrée le ' || to_char(max(done_at) at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI') as etat from v2.bascule;
