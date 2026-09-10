# Suivi administratif des dossiers

Dans **Administration → Demandes**, chaque fiche présente :

- **Prochaine action** : résumé de l’action à traiter et échéance. Le formulaire permet de l’enregistrer, de la modifier, de la marquer réalisée ou de l’annuler. Après réalisation ou annulation, une nouvelle action peut être créée ; les précédentes restent dans l’historique.
- **Documents du client** : documents du compte client et documents explicitement rattachés au dossier. Chaque ligne précise son rattachement réel. Un document du client n’est pas automatiquement attribué au dossier affiché. Le téléchargement conserve la route administrateur protégée existante.
- **Historique du dossier** : événements enregistrés, du plus ancien au plus récent, avec date, auteur enregistré et informations disponibles. Les anciens événements ne possédant qu’un statut sont présentés comme « Statut enregistré ». Aucune transition ancienne n’est reconstituée.

Le filtre **Actions arrivées à échéance · dossiers actifs** affiche les actions en attente dont la date est atteinte, hors dossiers archivés, terminés ou clos. Une action réalisée ou annulée en disparaît. La recherche et le filtre de statut restent combinables. Les échéances sont affichées à l’heure de Paris ; le champ de saisie indique le fuseau de l’appareil et enregistre l’instant correspondant.

Les modifications sont confirmées par le serveur et conservées après rechargement. Si deux administrateurs ou appareils modifient la même action, une version périmée est refusée : actualiser, examiner l’action enregistrée, puis choisir explicitement de remplacer la saisie. Modifier le statut ou les notes n’efface pas la prochaine action.

Ces actions ne déclenchent aucun e-mail ni rappel automatique. Elles servent au suivi dans l’administration.

## Publication et compatibilité

Migration minimale : `supabase/migrations/20260910231923_admin_follow_up.sql`. Elle complète `diagnostics` et `diagnostic_activity`, garde les anciennes lignes intactes et limite les mutations au rôle serveur. Appliquer d’abord en recette, puis en production avant de déployer le code qui lit les nouvelles colonnes.

Un retour à la version applicative précédente conserve les colonnes et les événements ajoutés. La signature de `update_sav` reste compatible ; son ancien paramètre d’échéance n’efface plus l’action gérée séparément. Ne pas supprimer ces données pour revenir à l’ancienne interface.

Contrôles locaux propres à ce lot : `tests/admin-dossier.test.ts`, `tests/admin-follow-up.test.ts`, `tests/admin-next-action-route.test.ts`. Les suites paiement, e-mail et authentification existantes ne font pas partie de ce lot.
