# Accès partenaires — septembre 2026

## Administration

Dans **Administration → Partenaires → Modifier / Accès**, l’entreprise sélectionnée est affichée au-dessus de la rubrique **Accès à l’espace partenaire**. Créer l’entreprise ne crée pas implicitement un compte : renseigner ensuite le contact, son adresse et un mot de passe provisoire de 12 à 128 caractères. Ce mot de passe n’est ni enregistré dans les tables applicatives ni envoyé par e-mail.

Le serveur crée le compte Supabase Auth (adresse confirmée par l’administrateur) puis son rattachement. Une erreur entre ces opérations signale explicitement que le compte Auth existe mais que l’accès n’est pas prêt. Réessayer détecte le compte existant : confirmer alors son rattachement sans remplacer son mot de passe. Les rattachements vers une autre entreprise sont refusés. La réactivation d’un rattachement désactivé demande une case explicite. Date et auteur des rattachements/réactivations figurent dans `partner_access_history` ; aucun ancien auteur n’est inventé.

## Premier mot de passe et autorisation

La métadonnée **app_metadata** `partner_password_change_required` est posée uniquement par le serveur lors de la création. Elle n’est pas dans `user_metadata`, modifiable par le titulaire. Chaque route partenaire vérifie l’utilisateur Auth actuel et la session existante, le rattachement et l’activité de l’entreprise. Les routes de dossiers/acquisition renvoient 428 tant que le mot de passe personnel n’est pas choisi. Les téléchargements protégés refusent aussi l’accès partenaire provisoire.

Le déclencheur privé `sanispa_partner_password_changed` enlève l’obligation dans la transaction Auth qui modifie effectivement le mot de passe. Il ne copie ni le mot de passe ni son empreinte. Une mise à jour du profil ou une opération annulée ne l’enlève pas. Le compte peut ensuite changer son mot de passe depuis **Mon espace partenaire → Modifier mon mot de passe**. La récupération existante reste inchangée ; son écran final propose désormais aussi la connexion partenaire.

Le lien de notification vise `/partenaire/leads/{id}`. Les pages redirigent les visiteurs non connectés vers la connexion puis, si nécessaire, vers le choix du mot de passe. Seuls `/partenaire`, `/partenaire/leads` et les identifiants internes de demande sont acceptés comme retours. Le serveur continue à vérifier l’accès au dossier ; le lien n’est pas un jeton d’autorisation.

## Intervention à domicile

L’ancienne soumission pouvait notifier automatiquement les partenaires du secteur. Les nouvelles interventions attendent une validation manuelle, dans **Administration → Demandes → ouvrir le dossier → Suivi → Validation de l’intervention et choix du partenaire**. La validation sélectionne un seul partenaire actif couvrant le département, enregistre son auteur et sa date, et programme sa notification une seule fois. Aucun ancien dossier n’est automatiquement approuvé ou rediffusé.

Sans date de validation, une ancienne intervention non attribuée et sans réservation engagée doit être validée avant une nouvelle acquisition. Les attributions et les réservations déjà engagées conservent leurs conditions. La gratuité/le paiement et l’attribution exclusive existants sont réutilisés ; aucun changement du tarif ni Checkout à zéro euro. La sélection administrative ouvre uniquement l’aperçu. Les coordonnées restent protégées jusqu’à l’attribution.

## Déploiement et retour arrière

Appliquer les migrations `partner_access` et `partner_manual_release` en recette avant le code, puis en production après validation. Elles sont additives ; aucun compte, mot de passe ou dossier existant n’est réinitialisé par ces migrations. Ne pas les réappliquer lorsque le registre distant emploie un autre horodatage pour le même nom.

Un retour de l’application à une version antérieure supprimerait la vérification du mot de passe provisoire et la validation manuelle dans les routes de lecture. Après création d’accès provisoires, privilégier un correctif en avant ; sinon désactiver explicitement les nouveaux accès concernés avant tout retour. Ne pas retirer les obligations ou les migrations pour contourner un problème de connexion.
