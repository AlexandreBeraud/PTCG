# Tâches de nuit (remake v2)

Node 18+ sans dépendance npm. Les jobs écrivent dans le schéma `v2` via
PostgREST avec un jeton signé (rôle `ptcg_job`), et chaque passage laisse une
ligne dans `v2.job_runs`, visible dans Réglages.

| Script | Quand | Rôle |
| --- | --- | --- |
| `pokemon.js` | dimanche 02:30 | une fiche par espèce **et par forme** (PokéAPI), noms FR, types, chemin du sprite NAS, type de forme pour les labels |
| `backup.sh` | 02:45 | `pg_dump` de toute la base `ptcg`, 14 jours gardés |
| `catalogue.js` | 03:00 | séries, extensions et cartes TCGdex (FR, repli EN), prix des cartes suivies, liens Cardmarket (calculés par la base), rangement des cartes par fiche, sigles et images de secours (pokemontcg.io) |

Options utiles : `--dry-run` partout ; pour le catalogue `--set=me02,me05`,
`--en=<id>`, `--all`, `--refresh`, `--no-prices`, `--no-images`.

## Rangement des cartes par fiche

Fait en base avec la même règle que l'ancienne appli : une carte Pokémon va
sur la fiche de la forme dont le label (préfixes **et** suffixes, mots entiers)
correspond à son nom, sinon sur l'espèce. Ce rangement automatique est la vue
matérialisée `v2.card_forms_auto` (recalcul : `select v2.refresh_card_forms();`,
fait par l'appli quand un label change et par les jobs). `v2.card_forms` y
ajoute en direct les fiches corrigées à la main (`v2.card_overrides`).

## Lien Cardmarket

Calculé par la base (`v2.refresh_cardmarket_urls`) quand l'extension a un code
Cardmarket (`sets.cardmarket_code`, proposé à partir de l'abréviation TCGdex à la
création, modifiable sur la page de l'extension) :
`…/Singles/Phantasmal-Flames/Mega-Charizard-X-ex-V1-PFL013?language=2`.
Sans code : lien de recherche. Un lien corrigé à la main
(`cardmarket_url_manual = true`) n'est jamais réécrit.

## Cartes sans image

Quand TCGdex n'a l'image d'une carte ni en VF ni en anglais, le catalogue la
cherche sur pokemontcg.io (code Cardmarket de l'extension, sinon son nom
anglais, plus le numéro) : 60 cartes par nuit, une nouvelle tentative par
semaine pour celles qu'il ne trouve pas. L'image trouvée est gardée à part
(`cards.image_fallback`) ; celle ajoutée à la main dans l'appli
(`cards.image_manual`) passe avant tout. Une clé pokemontcg.io (facultative)
se met dans `.env` : `POKEMONTCG_KEY=…`.

## Sigles des extensions

TCGdex n'a pas l'icône de beaucoup d'extensions. Le catalogue prend celle de
pokemontcg.io quand il y retrouve l'extension (code Cardmarket = `ptcgoCode`,
sinon même nom anglais), à chaque passage, pour toutes les extensions.
