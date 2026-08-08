-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : sprites Pokémon (Official Art / Home) — voir js/pokedex.js
--
--  • ven_pokemon_key / dep_pokemon_key : slug technique PokeAPI (ex.
--    "charizard", "ogerpon-wellspring-mask") rempli automatiquement dès
--    qu'un Pokémon est choisi dans le sélecteur de carte. Permet de
--    retrouver le sprite exact (numéro de Pokédex + forme précise) au lieu
--    du seul nom affiché (ven_pokemon_name / dep_pokemon_name), qui reste
--    inchangé et continue de servir à l'affichage.
--  • set_sprite_source : réglage global Paramètres › Affichage
--    ('official' ou 'home'), synchronisé comme les autres préférences.
--
-- Rejouable sans erreur (IF NOT EXISTS partout).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE ventes   ADD COLUMN IF NOT EXISTS ven_pokemon_key text;
ALTER TABLE depenses ADD COLUMN IF NOT EXISTS dep_pokemon_key text;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS set_sprite_source text DEFAULT 'official';
