-- Migration : sprites Personnages/Objets/Lieux/Énergies
-- ven_pko_key / dep_pko_key : "kind:id" (ex. "personnage:3")
ALTER TABLE ventes   ADD COLUMN IF NOT EXISTS ven_pko_key text;
ALTER TABLE depenses ADD COLUMN IF NOT EXISTS dep_pko_key text;
