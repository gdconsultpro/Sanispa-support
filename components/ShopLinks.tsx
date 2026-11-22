import { ShoppingBag } from "lucide-react";

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

function linksForProblem(problemType: string) {
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

export function ShopLinks({ problemType, compact = false }: { problemType: string; compact?: boolean }) {
  const links = linksForProblem(problemType);
  if (!links.length) return null;

  return (
    <section className={compact ? "mt-4 border-t border-sanispa-line pt-4" : "rounded-md border border-sanispa-line bg-white p-4 shadow-soft"}>
      <div className="flex items-start gap-3">
        {!compact ? <div className="mt-1 text-sanispa-blue">
          <ShoppingBag size={22} aria-hidden="true" />
        </div> : null}
        <div>
          <h2 className="font-bold text-sanispa-navy">Boutique SANISPA Collection</h2>
          {!compact ? <p className="mt-2 text-sm leading-6 text-sanispa-steel">
            Retrouvez les produits et pièces utiles selon le type de demande.
          </p> : null}
        </div>
      </div>

      <div className={compact ? "mt-1 grid gap-1" : "mt-4 grid gap-2"}>
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className={compact ? "focus-ring inline-flex min-h-11 items-center text-sm font-bold underline" : "focus-ring flex min-h-12 items-center justify-center rounded-md border border-sanispa-line bg-sanispa-ice px-3 py-2 text-center text-sm font-bold text-sanispa-navy hover:border-sanispa-blue"}
          >
            {link.label}
          </a>
        ))}
      </div>
    </section>
  );
}
