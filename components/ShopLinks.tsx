import { ShoppingBag } from "lucide-react";
import { ProblemType } from "@/lib/types";

const shopLinks = {
  waterProducts: {
    label: "Commander mes produits d'entretien",
    href: "https://www.sani-spa.fr/collection/categorie-produit/coast-spas/produits-dentretien/"
  },
  filters: {
    label: "Commander un filtre pour mon spa",
    href: "https://www.sani-spa.fr/collection/categorie-produit/filtres/"
  },
  parts: {
    label: "Voir les pièces détachées disponibles",
    href: "https://www.sani-spa.fr/collection/categorie-produit/pieces-detachees/"
  }
};

function linksForProblem(problemType: ProblemType | "") {
  switch (problemType) {
    case "traitement-eau":
      return [shopLinks.waterProducts, shopLinks.filters];
    case "filtration":
      return [shopLinks.filters, shopLinks.parts];
    case "pompe":
    case "chauffage":
    case "electrique":
    case "fuite":
      return [shopLinks.parts];
    case "autre":
      return [shopLinks.parts, shopLinks.filters];
    default:
      return [];
  }
}

export function ShopLinks({ problemType }: { problemType: ProblemType | "" }) {
  const links = linksForProblem(problemType);
  if (!links.length) return null;

  return (
    <section className="rounded-md border border-sanispa-line bg-white p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="mt-1 text-sanispa-blue">
          <ShoppingBag size={22} aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-bold text-sanispa-navy">Boutique SANISPA Collection</h2>
          <p className="mt-2 text-sm leading-6 text-sanispa-steel">
            Retrouvez les produits et pièces utiles selon le type de demande. Ces liens sont proposés en complément et ne bloquent pas le parcours d'assistance.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="focus-ring flex min-h-12 items-center justify-center rounded-md border border-sanispa-line bg-sanispa-ice px-3 py-2 text-center text-sm font-bold text-sanispa-navy hover:border-sanispa-blue"
          >
            {link.label}
          </a>
        ))}
      </div>
    </section>
  );
}
