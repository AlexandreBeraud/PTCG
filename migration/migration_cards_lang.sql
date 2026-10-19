-- Langue des données d'une carte du catalogue.
-- NULL ou 'fr' : carte importée en français (toutes les cartes existantes).
-- 'en' : extension pas encore traduite sur TCGdex, importée en anglais en
-- attendant. import-tcgdex.js remplace ces lignes par la version FR (même id)
-- dès qu'elle est disponible, sans toucher au lien Cardmarket.

ALTER TABLE cards ADD COLUMN IF NOT EXISTS lang text;

CREATE INDEX IF NOT EXISTS cards_lang_en_idx ON cards (set_id) WHERE lang = 'en';

NOTIFY pgrst, 'reload schema';
