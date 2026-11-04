# LiveTP

Outil de rendu de TP en direct pour les formations de Michel Ruiz (Alten). Michel est le seul formateur et le responsable des données. Il travaille sans terminal : lui expliquer simplement, en français, et l'associer aux décisions de fond ou de forme.

## Principes (cahier des charges validé, V0.3)
- **Aucune IA dans l'outil** : les participants utilisent leur propre IA et collent/déposent leurs rendus.
- Une seule zone de réponse libre (texte + jusqu'à 5 fichiers : image, vidéo, PDF), 50 Mo max par fichier (limite Supabase gratuit).
- Une réponse rendue est verrouillée ; le formateur peut la déverrouiller.
- Mode projection : une réponse à la fois, plein écran, **noms affichés**, rendu adapté au type (image, texte, vidéo, PDF).
- ~15 participants, 2-3 séances/mois. Mode dirigé uniquement en V1.
- RGPD : données en UE, notice à l'inscription, purge après 6 mois (à faire), rappel « aucune donnée client ».

## Architecture
- React + TS (Vite) → Netlify (`netlify.toml`, `public/_redirects`). Variables : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publiques).
- Supabase : tout le schéma dans `supabase/schema.sql` (idempotent). La sécurité repose sur RLS :
  formateur = ligne dans `admins` ; participant = connexion anonyme + ligne `participants` (via `join_session`).
  Toutes les écritures des participants passent par les fonctions SQL (`start_exercise`, `save_response`, `add_response_file`, `remove_response_file`).
- Stockage : buckets privés `documents/<session>/<exercice>/…` et `responses/<session>/<participant>/<exercice>/…`, URLs signées.
- Ne jamais committer de clé `service_role`, de mot de passe ou de `.env`.

## Vérifier avant de pousser
- `npm run build` (typecheck + build) sans erreur.
- Tester le SQL sur un Postgres local avec une imitation minimale de `auth`/`storage` quand le schéma change.
- Rendu desktop 1440 et mobile 390.
