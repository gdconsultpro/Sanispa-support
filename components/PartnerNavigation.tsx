import Link from "next/link";

const links = [
  ["Accueil", "/partenaire"],
  ["Demandes", "/partenaire/leads"],
  ["Interventions", "/partenaire/interventions"],
  ["Planning", "/partenaire/planning"],
  ["Visio", "/partenaire/visio"],
] as const;

export function PartnerNavigation({ current }: { current?: (typeof links)[number][0] }) {
  return (
    <nav aria-label="Espace partenaire" className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
      {links.map(([label, href]) => (
        <Link key={href} href={href} aria-current={current === label ? "page" : undefined}
          className={`focus-ring grid min-h-11 place-items-center rounded-xl border px-2 py-2 text-center text-sm font-bold ${current === label ? "border-sanispa-navy bg-sanispa-navy text-white" : "border-sanispa-line bg-white text-sanispa-navy"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
