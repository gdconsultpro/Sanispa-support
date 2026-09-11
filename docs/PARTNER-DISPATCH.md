# Décision de diffusion des interventions à domicile

Administration → Demandes → ouvrir le dossier → Suivi → **Décision de diffusion de l’intervention**.

- **À valider** : aucune visibilité partenaire, même anonymisée ; aucun e-mail partenaire, aucune nouvelle réservation ou acquisition. Le département propose des destinataires dans l’administration seulement.
- **Conserver chez SANISPA** puis confirmation : décision interne conservée, sans destinataire. Notes, prochaine action, statuts et archivage restent utilisables. Ce lot ne comporte pas de révocation ou de changement d’une décision confirmée.
- **Transmettre à un partenaire** : choisir explicitement une entreprise active couvrant le département, puis confirmer. Seule cette entreprise est autorisée à consulter l’offre. Le réglage Payant/Gratuit apparaît dans le choix et reste déterminé côté serveur lors de l’acquisition. La transmission n’attribue pas le dossier et ne débloque aucune coordonnée.
- L’indicateur **Diffusion** et son filtre sont indépendants du statut de traitement. Les opérations enregistrent date, auteur et destinataire dans l’historique, sans inventer d’événements anciens.
- Les acquisitions et réservations antérieures sont préservées et identifiées séparément. Aucun traitement rétroactif et aucun envoi ne sont déclenchés par la migration. Le parcours traitement d’eau reste distinct.

## Enregistrement et protections

Migration additive `20260911121701_partner_dispatch_decision.sql`. Deux colonnes de conservation interne, contrainte d’exclusion avec la diffusion existante, index, horodatage de la première tentative de notification. Pas de modification des données historiques.

Les décisions utilisent le verrou du dossier, comme les acquisitions existantes ; RPC réservées à `service_role`, contrôle d’administrateur actif et contrôle serveur de session/MFA existant sur la route. Le destinataire doit couvrir le département et être actif. Une seule décision peut être confirmée, et sa répétition est idempotente. La soumission retire aussi les destinataires et tâches partenaires des interventions à domicile, même si le serveur lui en fournit par erreur ; les tâches client et SANISPA sont conservées.

Le contrôle partagé `lib/partner-release.ts` s’applique aux listes, détail et reprises de notification ; la même condition est imposée par la transaction d’acquisition. Les attributions et réservations déjà engagées gardent leurs conditions. Aucun nouveau droit Data API public n’est accordé.

## Notifications

Une tâche unique par dossier/destinataire est créée dans la transaction de diffusion. Les reprises relisent l’autorisation et annulent les tâches anciennes ou devenues inéligibles. Le transport Resend reçoit une clé stable, persistée dans la tâche. Son acceptation doit être confirmée et enregistrée pour afficher « Envoi confirmé par le service d’e-mail » ; cela ne prouve pas la réception en boîte de réception.

[Resend conserve les clés d’idempotence pendant 24 h](https://resend.com/docs/dashboard/emails/idempotency-keys). Les reprises incertaines s’arrêtent après 23 h et passent à `delivery_unknown`, au lieu de risquer un doublon. Un opérateur doit alors vérifier l’envoi dans Resend avant toute action ; aucune relance aveugle n’est proposée. Une configuration de transport différente de Resend ne déclenche pas ces notifications protégées et demande également une vérification.

Le bouton **Actualiser l’état** consulte la tâche réelle sans envoyer d’e-mail. Un double clic sur une décision confirmée ne remet pas la tâche en attente et ne relance pas l’envoi.

## Vérification ciblée

Fichiers `tests/partner-dispatch-{database,notifications,routes}.test.ts` : 14 contrôles sur base éphémère et réseau simulé strict, aucune communication réelle Auth/Stripe/e-mail. Réservation payante vérifiée en base avec tarif fictif, sans création de Checkout ni paiement. Le transport simulé couvre aussi une réponse e-mail acceptée suivie d’une perte de l’accusé côté base, puis la reprise sans doublon.

Compilation Next.js et recette documentées dans le bilan de livraison. Les contrôles antérieurs de paiement, inscription, mots de passe et MFA sont déjà validés, non rejoués dans ce lot.

## Publication et retour arrière

Appliquer la migration en recette puis en production après validation, avant le déploiement du code. Le code précédent connaît déjà la validation manuelle, mais ne sait pas afficher la conservation interne : privilégier un correctif en avant. Ne jamais effacer une décision, un historique, une acquisition ou une tâche envoyée pour revenir à une version antérieure. La base demeure la source d’autorisation de l’acquisition.
