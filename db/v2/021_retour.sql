-- Retour à l'ancienne appli : elle redevient la référence et accepte de nouveau
-- les saisies ; les reprises vers la v2 sont de nouveau possibles.

\set ON_ERROR_STOP on

delete from v2.bascule;
grant insert, update, delete on all tables in schema public to anon;

select 'Ancienne appli de nouveau modifiable' as etat;
