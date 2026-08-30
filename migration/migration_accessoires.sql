-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : catégorie "Accessoires" (Édition › Encyclopédies)
--
-- Aucune nouvelle colonne n'est nécessaire : "Accessoires" réutilise
-- entièrement la table perso_objets existante (pko_kind passe simplement la
-- valeur 'accessoire' en plus de 'personnage'/'objet'/'lieu'/'energie', déjà
-- stockée en texte libre) et les colonnes ven_pko_key / dep_pko_key déjà en
-- place (format "kind:id", voir migration_pko_sprite.sql) pour retrouver
-- l'entrée choisie dans une vente/dépense — voir js/perso-objets.js
-- (PKO_EXTRA_KINDS) et js/ventes-achats.js (_cardPickerSelectAccessoireEntry).
--
-- Ce script ne fait qu'une chose, par précaution : si une contrainte CHECK
-- avait été posée à la main sur perso_objets.pko_kind pour limiter les 4
-- valeurs d'origine (rien de tel n'est visible dans le code JS ni dans les
-- migrations existantes, donc probablement un no-op), elle est supprimée
-- pour laisser passer 'accessoire'. Rejouable sans erreur.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'perso_objets'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%pko_kind%'
  LOOP
    EXECUTE format('ALTER TABLE perso_objets DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
