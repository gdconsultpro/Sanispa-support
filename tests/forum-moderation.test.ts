import { test } from "node:test";
import assert from "node:assert/strict";
import { moderateForumPost } from "../lib/premium-forum";

test("ordinary experiences and questions publish without manual approval", () => {
  for (const value of [
    "Test du forum pour voir si ça fonctionne en public",
    "Mon eau reste trouble après nettoyage du filtre. Avez-vous déjà rencontré ce problème ?",
    "Je nettoie mes cartouches chaque semaine, cela fonctionne bien chez moi.",
    "Le clavier affiche FLO et la température est à 32 degrés. Que dois-je observer ?",
  ]) assert.deepEqual(moderateForumPost(value), { state: "approved", solicitationFlag: false });
});
test("commercial offers, links, personal details and sensitive advice wait for review", () => {
  for (const value of [
    "Contactez-moi au 06 12 34 56 78 pour un devis gratuit.",
    "Écrivez à client@example.invalid pour me joindre.",
    "Je vends mon équipement, profitez de cette offre.",
    "Regardez ma boutique : https://example.invalid",
    "Voir les pièces sur ma-boutique.fr",
    "Je suis au 12 rue des Roses à Paris.",
    "Mon mot de passe est exposé dans ce message.",
    "Il faut shunter le capteur de sécurité.",
    "Mélange le chlore et un acide pour nettoyer.",
    "Ce connard ne comprend rien à mon problème.",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ]) assert.equal(moderateForumPost(value).state, "pending", value);
});
