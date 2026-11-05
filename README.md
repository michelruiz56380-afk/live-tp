# LiveTP

Outil de rendu de travaux pratiques en direct, pour les formations de Michel Ruiz (Alten).
Les participants travaillent avec **leur propre IA**, puis publient leur prompt et leur résultat
(texte, image, vidéo, PDF). Le formateur suit l'avancement en direct et projette les réponses
une par une pour les corriger ensemble. **L'outil n'appelle aucune IA.**

- Interface : React + TypeScript (Vite), hébergée sur Netlify.
- Données, connexion et fichiers : Supabase (région Europe).

## Mise en route (une seule fois)

### 1. Supabase
1. **Vérifier la région** du projet : *Project Settings → General* doit indiquer une région européenne (Paris, Francfort, Irlande…).
2. **Créer la base** : *SQL Editor → New query*, coller tout le contenu de [`supabase/schema.sql`](supabase/schema.sql), cliquer **Run**. Le script peut être relancé sans risque.
3. **Autoriser les participants sans compte** : *Authentication → Sign In / Providers* → activer **Allow anonymous sign-ins**.
4. **Autoriser votre adresse de formateur** : dans *SQL Editor*, exécuter (avec votre e-mail) :
   ```sql
   insert into public.trainer_invites (email) values ('votre@email.fr');
   ```
5. **Adresse du site** : *Authentication → URL Configuration* → *Site URL* = l'adresse Netlify (ex. `https://livetp.netlify.app`), et ajouter `https://livetp.netlify.app/**` dans *Redirect URLs*. Les liens envoyés par e-mail (confirmation, mot de passe oublié) y renverront.
6. **Récupérer les deux valeurs publiques** : *Project Settings → API* (ou *Data API*) :
   - *Project URL* ;
   - la clé **publishable** (ou *anon public*).
   ⚠️ Ne jamais utiliser ni communiquer la clé **secret / service_role** ni le mot de passe de la base.

### 2. Netlify
1. *Add new site → Import an existing project → GitHub* → dépôt `live-tp`, branche `main`.
2. Les réglages de build sont lus automatiquement depuis `netlify.toml`.
3. *Site configuration → Environment variables* : ajouter
   - `VITE_SUPABASE_URL` = la *Project URL* ;
   - `VITE_SUPABASE_ANON_KEY` = la clé *publishable / anon*.
4. Relancer un déploiement (*Deploys → Trigger deploy*). Renommer le site en `livetp` si le nom est libre (*Site configuration → Change site name*).

## Adresses
- `/` : accueil participant (saisie du code, étape 2).
- `/admin` : espace formateur.
- `/admin/inscription` : création d'un compte formateur. Seules les adresses autorisées (rubrique « Formateurs » de l'espace formateur) deviennent formateur, après confirmation de leur e-mail.

## Avancement
- [x] Étape 1 : connexion formateur, sessions (créer, modifier, dupliquer, supprimer), exercices et documents de travail.
- [ ] Étape 2 : côté participant (QR code, inscription, attente, consigne, rendu texte et fichiers).
- [ ] Étape 3 : tableau de bord en direct, exercice suivant, fin de séance.
- [ ] Étape 4 : mode projection, validation, export CSV.
- [ ] Étape 5 : répétition générale.

## Développement
```bash
cp .env.example .env.local   # puis renseigner les deux valeurs publiques
npm install
npm run dev
```
