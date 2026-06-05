# SANISPA Diagnostic MVP

Web app mobile-first pour le pré-diagnostic de pannes de spas : questionnaire guidé, photos obligatoires, résumé, demande d'intervention, demande de devis et accompagnement à distance payé par Stripe.

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
STRIPE_PRICE_DIAGNOSTIC_PHOTO=
STRIPE_PRICE_ASSISTANCE_GUIDED=
STRIPE_PRICE_ASSISTANCE_PREMIUM=
RESEND_API_KEY=
ADMIN_NOTIFICATION_EMAIL=
EMAIL_FROM=
ADMIN_USERNAME=
ADMIN_PASSWORD=
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

## Configuration Stripe

Créer trois produits/prix Stripe :

- Diagnostic photo : 49 €
- Assistance guidée : 89 €
- Assistance premium : 129 €

Copier les identifiants de prix dans :

- `STRIPE_PRICE_DIAGNOSTIC_PHOTO`
- `STRIPE_PRICE_ASSISTANCE_GUIDED`
- `STRIPE_PRICE_ASSISTANCE_PREMIUM`

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
6. Choix final : intervention, devis ou accompagnement à distance
7. Paiement Stripe pour l'accompagnement
8. Confirmation

Photos obligatoires :

- Photo du clavier
- Photo du compartiment technique

Photos optionnelles :

- Plaque signalétique
- Problème visible

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

Le dashboard est volontairement simple. Pour une mise en production, ajouter une authentification admin, des règles d'accès plus fines, une page détail dossier et une action de changement de statut.
