# Activation de l’espace client SANISPA

Cette version part du dépôt `gdconsultpro/Sanispa-support`, commit `f10726789bce57c6901a0dc6bbbf8a94240f6220`. Les fonctions partenaires et les offres de cette version sont conservées.

## Ce que le client peut faire

1. Saisir ses coordonnées et la panne, puis continuer.
2. Confirmer son adresse par un lien personnel reçu par e-mail (création du compte si nécessaire). Un compte existant peut continuer avec son mot de passe.
3. Remplir son questionnaire et joindre ses photos. La sauvegarde automatique affiche sa confirmation.
4. Revenir dans son espace client et reprendre son brouillon, y compris depuis un autre appareil, après connexion.
5. Envoyer une seule demande, retrouver son résumé et reprendre l’assistance eau ou son paiement.

Avant confirmation du premier accès, les coordonnées restent sur l’appareil de saisie. Le premier lien doit être ouvert sur cet appareil pour les enregistrer dans le compte ; s’il est ouvert ailleurs, revenir sur l’appareil de saisie, se connecter et utiliser « J’ai confirmé mon adresse, continuer ici ». Les pages de questionnaire et photos enregistrent automatiquement les modifications après un bref délai. Le navigateur doit autoriser le stockage local.

## Préparer la base et le déploiement

Ne pas fusionner et déployer sans les migrations : cette version dépend des nouvelles tables et fonctions. Les tests locaux utilisent une base jetable ; ils ne remplacent pas une recette Supabase/Vercel.

1. Identifier le projet Supabase rattaché au site et prendre un point de restauration/sauvegarde. Tester d’abord sur un projet de recette distinct.
2. Pour une base neuve seulement, exécuter `supabase/schema.sql`. Sur la base existante correspondant au dépôt de juin, appliquer les migrations non encore enregistrées, dans l’ordre : `20260908_01_client_access`, `20260908_02_submission`, `20260908_03_payments`, `20260908_04_sav`, puis `20260910152503_admin_mfa_and_session_revocation`. Comparer d’abord le schéma actuel et l’historique des migrations ; ne pas réappliquer aveuglément les fichiers déjà exécutés.
3. Les photos deviennent privées. Prévoir une courte fenêtre de maintenance : l’ancien code utilise encore des liens publics et n’est pas compatible avec cette modification. Déployer le nouveau code immédiatement après application validée des migrations. Revenir à l’ancien code seul ne constitue pas un retour arrière sûr.
4. Vérifier les variables Vercel : `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, les prix Stripe utilisés par les offres, `OPENAI_API_KEY`, `RESEND_API_KEY`, `ADMIN_NOTIFICATION_EMAIL`, `EMAIL_FROM`. Les secrets serveur ne doivent jamais porter le préfixe `NEXT_PUBLIC_`. Construire le déploiement de production avec ses propres variables ; ne jamais promouvoir un build construit avec les clés ou la base de test.
5. Dans Supabase Auth, activer l’authentification e-mail, conserver la confirmation des adresses et configurer un SMTP transactionnel de production. Autoriser l’URL exacte `https://sanispa-support.vercel.app/auth/retour` (ainsi que celle du domaine personnalisé ou de la recette). Les modèles d’e-mail de lien magique et de confirmation doivent utiliser `{{ .ConfirmationURL }}` pour le flux implicite employé ici. Les limites d’envoi de Supabase s’appliquent aussi.
6. Configurer les événements Stripe `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` et `charge.refunded`. La session eau réutilise le paiement en cours pour éviter les doubles passages en caisse. Le remboursement intégral ferme l’accès eau ; le remboursement partiel ne le ferme pas automatiquement.
7. Installer avec `pnpm install --frozen-lockfile`, puis `pnpm test`, `pnpm lint`, `pnpm build`. `pnpm-lock.yaml` remplace l’ancien verrou npm. Le projet utilise pnpm 11.19.0.
8. Les notifications sont enregistrées dans une file persistante. Le bouton de l’administration relance les envois en attente. Pour une relance autonome, configurer un appel périodique à `/api/cron/notifications`, avec `Authorization: Bearer <CRON_SECRET>`. Aucun abonnement ni ordonnanceur n’est créé par cette modification.
9. Préparer le compte administrateur personnel dans Supabase Auth et son appartenance à `admin_users`, uniquement pour l’identité expressément autorisée. Le propriétaire confirme son adresse, définit lui-même son mot de passe et associe son application TOTP dans `/admin/connexion`. L’accès exige une session active et le niveau AAL2 côté serveur. Les anciennes variables `ADMIN_USERNAME`/`ADMIN_PASSWORD` ne sont plus utilisées par cette version ; les retirer après vérification du déploiement et du plan de retour arrière.

## Contrôles avant ouverture aux clients

- Nouvelle adresse : recevoir le lien, confirmer, sauvegarder un questionnaire partiel et retrouver le brouillon après déconnexion.
- Sur un autre appareil : se connecter à la même adresse et reprendre les réponses et photos enregistrées.
- Deux appareils sur le même brouillon : une version périmée doit être refusée, puis rechargée explicitement depuis l’espace client.
- Autre client : accès refusé aux brouillons, documents et paiements d’un autre compte. Une adresse e-mail seule ne doit plus restituer une conversation eau.
- Envoyer un dossier, recommencer après une interruption simulée : un seul dossier et une seule série de notifications.
- Stripe en mode test : succès, annulation, paiement différé, répétition d’événement et remboursement intégral ; vérifier l’accès et sa date de fin.
- Vérifier la réception des e-mails, leur relance, les PDF longs et les photos depuis l’administration et les comptes partenaires autorisés.
- Vérifier la création des règles privées et la suppression des anciennes valeurs `password` dans les métadonnées. Si des comptes étaient concernés, organiser leur réinitialisation de mot de passe ; effacer la métadonnée ne change pas leur mot de passe.

## Points opérationnels restant à valider

- Les anciens dossiers sont rattachés une seule fois aux comptes dont l’adresse est déjà confirmée au moment de la migration. Les anciens clients sans compte confirmé nécessitent une procédure de rattachement contrôlée ; aucune attribution automatique par une adresse déclarée n’a été ajoutée.
- L’administration utilise un compte personnel avec TOTP. Vérifier l’accès autorisé, le refus des comptes non administrateurs, la déconnexion et la disparition des vues privées dans les autres onglets. La déconnexion administrateur ferme la session courante ; elle ne révoque pas les autres appareils. Une réinitialisation de mot de passe est suivie d’une révocation globale des sessions.
- L’assistant répond à partir des valeurs et du texte enregistré. Il ne prétend plus lire les photos et signale ses indisponibilités. Une véritable analyse d’image n’est pas ajoutée dans cette version.
- La suppression définitive de dossiers est désactivée au profit de l’archivage, pour conserver les paiements et l’historique. La politique de conservation et l’effacement sur demande restent à organiser.
- Les documents joints sont limités à 3 Mo pour rester dans la limite de requête de l’hébergement. Les photos de diagnostic sont compressées et bornées automatiquement.
- Les tests automatiques n’envoient aucun e-mail et n’effectuent aucun paiement réel. La recette visuelle, la configuration de Supabase et le déploiement ne sont pas attestés par ces tests.

Références techniques : [liens personnels Supabase](https://supabase.com/docs/guides/auth/auth-email-passwordless), [correctifs Next.js du 25 août 2026](https://nextjs.org/blog/august-2026-security-release).
