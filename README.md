# PTCG Collection — rework sync cloud + schéma + découpage des fichiers

## Mise à jour v2 — préfixes de colonnes + séparation Boosters/Goodies

**1. Convention de nommage.** Chaque colonne commence maintenant par les 3
lettres de sa table (ex. `blocs.blo_user_id`, `ventes.ven_prix`). Quelques
préfixes ont dû s'écarter du "3 premières lettres" strict pour éviter des
collisions entre tables proches — tableau complet :

| Table | Préfixe | Pourquoi |
|---|---|---|
| blocs | `blo` | littéral |
| extensions | `ext` | littéral |
| classeurs | `cla` | littéral |
| classeur_extensions | `cle` | `cla` déjà pris par classeurs |
| collection | `col` | littéral |
| boosters | `boo` | littéral |
| goodies | `goo` | littéral (nouvelle table) |
| acheteurs | `ach` | littéral |
| acheteur_commandes | `acc` | `ach` déjà pris |
| vendeurs | `vnd` | `ven` réservé à ventes |
| vendeur_commandes | `vco` | pour rester distinct de `vnd`/`ven` |
| ventes | `ven` | littéral |
| depenses | `dep` | littéral |
| label_categories | `lab` | littéral |
| form_label_overrides | `for` | littéral |
| pokemon_label_assignments | `pok` | littéral |
| settings | `set` | littéral |
| set_mapping | `stm` | `set` déjà pris par settings |
| cards | *(inchangée)* | voir note ci-dessous |

`form_label_overrides` et `set_mapping` existaient déjà avec de vraies
données (labels déjà configurés, mappings TCGdex déjà faits) : leurs
colonnes sont renommées avec `ALTER TABLE ... RENAME COLUMN`, pas
recréées — rien n'est perdu. Toutes les autres tables (créées par le premier
script) sont simplement recréées, puisqu'elles ne contenaient que des
données re-synchronisables depuis ton navigateur.

**Exception : `cards` n'est pas renommée.** Cette table est énormément lue
par l'appli mais une seule écriture s'y fait depuis le navigateur (renommage
manuel d'une carte) — le catalogue lui-même vient très probablement d'un
import externe (TCGdex) que je ne vois pas dans ces fichiers. La renommer
risquerait de casser cet import sans que je puisse le corriger de mon côté.
Dis-moi si tu veux que je la fasse quand même.

**2. Séparation Boosters / Goodies.** La table `boosters` ne contient
désormais que les entrées `product_type = 'booster'`. Une nouvelle table
`goodies`, structure identique, reçoit tout le reste (`deck`, `etb`,
`premium`, et toute nouvelle valeur future). `js/sync.js` répartit déjà
automatiquement selon `product_type` à chaque synchro. Côté appli, rien ne
change encore : les deux tables se rechargent dans le même `_D.boosters_data`
qu'avant — la séparation en deux onglets dans l'interface (JS/HTML) reste à
faire quand tu seras prêt, la base est prête à l'accueillir.

**3. Deux bugs trouvés en testant réellement le script** (contre un vrai
Postgres, avec les rôles `anon`/`authenticated` et des policies RLS, pour
être sûr avant de te le donner) :
- Une policy RLS ne suffit pas si la table n'a pas aussi un `GRANT` de base
  pour `anon` — sans ça, Postgres bloque avec *"permission denied"* avant
  même de regarder la policy. Le script pose maintenant les deux.
- Une clé étrangère composite (`user_id`+`commande_id`) avec
  `ON DELETE SET NULL` essaie de mettre TOUTES ses colonnes à NULL, y
  compris `user_id` — qui est `NOT NULL`. Ça fait planter la suppression
  d'une commande. `ventes`/`depenses` référencent maintenant `acc_id`/`vco_id`
  seuls (avec une contrainte `UNIQUE` dédiée) pour éviter le problème.

Le script (`supabase_schema.sql`) a été rejoué plusieurs fois de suite, à
partir de zéro et en simulant l'ancien schéma avec des vraies données, pour
vérifier qu'il ne casse rien dans les deux cas.

---



## 1. Pourquoi rien ne se synchronisait

Le code de sync était en fait correct dans ses grandes lignes (bonne URL,
bonne clé, bon débounce). Le vrai coupable : **RLS (Row Level Security)**.

Sur Supabase, une table créée depuis l'interface a RLS activé par défaut,
**sans aucune policy**. Résultat : la clé `anon` se fait refuser TOUTES les
requêtes (lecture ET écriture), silencieusement — pas d'erreur visible dans
l'appli, juste rien qui arrive en base. C'est cohérent avec ce que tu
observais ("tout est bon et pourtant rien ne fonctionne") et avec le fait que
`form_label_overrides` marchait (tu avais mis une policy dessus à la main)
alors que `ptcg_collection` ne marchait pas.

`supabase_schema.sql` corrige ça pour **toutes** les tables (nouvelles et
existantes) avec une policy permissive pour `anon`/`authenticated`.

## 2. Ce qui a changé côté base de données

- **Supprimées** : `user_cards` (jamais utilisée), `ptcg_collection` (l'ancien
  blob JSON unique), `label_settings` (l'exemple que tu as donné : un tableau
  entier stocké dans une seule cellule).
- **Créées**, une ligne = une entité, avec vraies clés primaires/étrangères :
  `blocs`, `extensions`, `classeurs`, `classeur_extensions`, `collection`
  (grille de possession Pokédex), `boosters`, `acheteurs`, `vendeurs`,
  `acheteur_commandes`, `vendeur_commandes`, `ventes`, `depenses`,
  `label_categories`, `pokemon_label_assignments`, `settings`.
- **Complétée** : `form_label_overrides` (déjà correcte, une ligne par label)
  reçoit une colonne `category_id` qui absorbe l'ancien
  `label_category_assignments`.

Le détail de chaque table, les FK et les policies sont dans
`supabase_schema.sql`. Certaines relations restent volontairement des index
"souples" plutôt que des FK strictes (ex. `extensions.bloc_id`,
`ventes.card_id`) parce que l'appli autorise la valeur "aucun"/carte saisie à
la main — une vraie FK aurait fait planter ces enregistrements.

**À faire** : copie-colle tout `supabase_schema.sql` dans Supabase → SQL
Editor → Run. Le script est idempotent (relançable sans risque).

## 3. Ce qui a changé côté synchronisation (`js/sync.js`, nouveau fichier)

Avant : un seul objet `_D` géant sérialisé en JSON dans une colonne.
Maintenant : chaque domaine (classeurs, ventes, catégories de labels…) a sa
table, et `js/sync.js` sait le lire/écrire ligne par ligne.

- **Push** (débouncé 1.2s après chaque `saveData()`) : pour chaque table,
  dans un ordre qui respecte les clés étrangères, on supprime les lignes de
  cet utilisateur puis on réinsère l'état actuel (upsert en masse, 1 requête
  par table). Ce que contient le navigateur devient la vérité côté cloud.
- **Pull** (une fois au chargement) : comparaison d'un horodatage global
  (`settings.data_ts`, équivalent de l'ancien `_D._ts`) ; si le cloud est plus
  récent, on reconstruit tout depuis les tables cloud.
- **Erreurs toujours visibles** : tout échec HTTP remonte maintenant en toast
  avec le code HTTP, au lieu de finir dans la console uniquement.
- `form_label_overrides` garde son mécanisme dédié existant (déjà correct),
  juste complété pour la colonne `category_id`.

Les boutons "Synchroniser" (topbar + Paramètres) et "Sauvegarder" (config
Supabase perso) fonctionnent toujours pareil pour toi, ils sont juste
branchés sur le nouveau moteur.

## 4. Découpage des fichiers

`app.js` (7230 lignes) → 8 fichiers dans `js/`, découpés le long des sections
déjà existantes dans le code (aucune logique déplacée, juste coupée aux
bonnes frontières) :

- `core.js` — état `_D`, chargement/sauvegarde locale, helpers génériques
- `collection.js` — Extensions, Classeurs, Boosters (vues + CRUD + drag&drop)
- `edition.js` — Édition des blocs/extensions, Statistiques, Navigation, Modals, Paramètres
- `mapping.js` — Mapping TCGdex ↔ PTCG
- `labels.js` — Labels de formes spéciales (édition + sync)
- `ventes-achats.js` — Ventes, Achats, Acheteurs, Vendeurs, Bilan, sélecteurs de carte
- `label-categories.js` — Générations & couleurs, Catégories de labels
- `pokedex.js` — Pokédex (grille, fiche, formes, cartes TCG, évolutions)

`styles.css` (1829 lignes) → 4 fichiers dans `css/` : `base.css`,
`collection.css`, `pokedex.css`, `ventes-achats.css`.

`index.html` charge tout dans le bon ordre. Un détail technique important :
tous les fichiers partagent le même scope global (pas de modules ES), donc
les variables d'état qui étaient en `let`/`const` au premier niveau sont
passées en `var` pour rester visibles d'un fichier à l'autre — comportement
strictement identique, ça élimine même une classe de bugs d'ordre de
déclaration (`let` a un TDZ, pas `var`).

## 5. Pour déployer

1. Exécute `supabase_schema.sql` dans Supabase (SQL Editor → Run).
2. Remplace les fichiers de ton projet par ceux fournis ici (mêmes noms,
   `index.html`/`config.js`/`data.js` à la racine, `js/` et `css/` en
   sous-dossiers).
3. Recharge en local ET sur Netlify, fais une modif quelque part (ex. crée un
   classeur), et vérifie dans Supabase → Table Editor que la ligne apparaît
   dans la table correspondante.

Si un push échoue, tu verras maintenant un toast rouge avec le code HTTP —
utile si jamais une policy ou une colonne manque encore quelque part.
