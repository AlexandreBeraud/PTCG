-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : "Pour le compte de" sur les ventes (tiers)
--
-- Permet de marquer une vente comme faite pour le compte d'un tiers (ex. une
-- amie dont on vend les cartes) plutôt que pour soi — voir js/ventes-achats.js
-- (_saleOwnerBadgeHtml, filtre Propriétaire) et l'onglet Bilan (section
-- "Bilan tiers", exclue du bilan personnel).
-- Vide par défaut = vente pour soi (comportement inchangé dans 99% des cas).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE ventes ADD COLUMN IF NOT EXISTS ven_pour_compte_de text NOT NULL DEFAULT '';
