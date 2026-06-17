# SANISPA Diagnostic MVP

Web app mobile-first pour le SAV SANISPA : comptes clients, spas enregistrés, demandes techniques gratuites, diagnostic IA de traitement d'eau payé par Stripe, documents, administration et fondations partenaires.

## Installation

```bash
npm install
npm run dev
```

Application locale : `http://localhost:3000`

## Variables d'environnement

Copier `.env.example` vers `.env.local`, puis renseigner :

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_WATER_ASSISTANT=
RESEND_API_KEY=
ADMIN_NOTIFICATION_EMAIL=
EMAIL_FROM=
EMAIL_REPLY_TO=
ADMIN_USERNAME=
ADMIN_PASSWORD=
WATER_ASSISTANCE_VALIDITY_DAYS=30
```

## Configuration Supabase

1. Créer un projet Supabase.
2. Exécuter le fichier `supabase/schema.sql` dans l'éditeur SQL Supabase.
3. Vérifier que le bucket `diagnostic-photos` existe dans Storage.
4. Copier l'URL du projet dans `NEXT_PUBLIC_SUPABASE_URL`.
5. Copier la clé `service_role` dans `SUPABASE_SERVICE_ROLE_KEY`.

Tables créées :

- `customers`
- `diagnostics`
- `diagnostic_answers`
- `diagnostic_photos`
- `payments`
- `client_profiles`
- `client_spas`
- `client_documents`
- `water_assistance_sessions`
- `water_assistance_messages`
- `partners`
- `partner_departments`
- `lead_purchases`

## Configuration Stripe

Créer un produit/prix Stripe :

- Diagnostic Traitement d'Eau IA : 9 €

Copier l'identifiant de prix dans :

- `STRIPE_PRICE_WATER_ASSISTANT`

Les anciennes offres d'assistance humaine 49 €, 89 € et 129 € sont conservees dans le code comme archivees/desactivees, mais elles ne sont plus proposees au client.

Configurer un webhook Stripe vers :

```text
https://votre-domaine.fr/api/stripe-webhook
```

Événement requis :

- `checkout.session.completed`

Copier le secret du webhook dans `STRIPE_WEBHOOK_SECRET`.

## Notifications email

Les demandes sont toujours enregistrees dans Supabase et visibles dans `/admin`.

Pour recevoir aussi un email a chaque nouvelle demande, creer un compte Resend, puis ajouter dans `.env.local` :

```bash
RESEND_API_KEY=
ADMIN_NOTIFICATION_EMAIL=contact@votre-domaine.fr
EMAIL_FROM=SANISPA <notifications@votre-domaine.fr>
```

En local, Resend peut utiliser `SANISPA <onboarding@resend.dev>` comme expediteur de test si `EMAIL_FROM` est vide. En production, il est recommande de verifier le domaine SANISPA dans Resend puis d'utiliser une adresse du domaine.

## Parcours client

1. Accueil
2. Informations client et spa
3. Questionnaire dynamique selon le type de panne
4. Upload photos
5. Résumé structuré
6. Choix final : demande technique gratuite ou diagnostic IA traitement d'eau
7. Paiement Stripe uniquement pour le diagnostic IA traitement d'eau
8. Confirmation

Les demandes techniques sont gratuites. Elles sont qualifiees, associees a un departement calcule depuis le code postal, puis preparees pour une future diffusion aux partenaires SANISPA.

## Dashboard admin

Disponible sur `/admin`.

Le dashboard est protege par identifiant et mot de passe. Ajouter dans les variables d'environnement :

```bash
ADMIN_USERNAME=
ADMIN_PASSWORD=
```

Il affiche :

- liste des demandes
- statut
- type de panne
- coordonnées client
- photos
- résumé des réponses
- choix client
- paiement effectué ou non

## Déploiement Vercel

1. Importer le dépôt sur Vercel.
2. Ajouter toutes les variables d'environnement.
3. Déployer.
4. Mettre à jour `NEXT_PUBLIC_APP_URL` avec l'URL de production.
5. Configurer le webhook Stripe avec l'URL de production.

## Notes MVP

Le dashboard admin est protege par identifiant et mot de passe via `ADMIN_USERNAME` et `ADMIN_PASSWORD`. Pour une mise en production avancee, prevoir ensuite des roles admin plus fins et une page detail dossier plus complete.
