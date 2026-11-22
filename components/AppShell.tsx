import Image from "next/image";
import Link from "next/link";
import { paymentsPaused } from "@/lib/commercial-mode";
import { DeclarationEntry } from "./DeclarationEntry";
import { ClientAccountLink } from "./ClientAccountLink";
import { ProfessionalAccountLink } from "./ProfessionalAccountLink";

export function AppShell({
  children,
  compact = false,
  clientSpace = false,
  clientHome = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
  clientSpace?: boolean;
  clientHome?: boolean;
}) {
  return (
    <main className="app-background min-h-screen">
      {paymentsPaused() ? <div className="sanispa-service-banner bg-sanispa-blue px-4 py-2 text-center text-xs font-medium text-white">Services gratuits pour les particuliers et les partenaires · Sans carte bancaire</div> : null}
      <header className="border-b border-sanispa-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <Link href="/" className="inline-flex items-center focus-ring">
            <Image
              src="/sanispa-logo.png"
              width={120}
              height={72}
              priority
              alt="SANISPA"
              className="h-12 w-auto object-contain"
            />
          </Link>
          <nav aria-label="Navigation principale" className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-sm font-bold sm:justify-end">
            {clientHome ? null : <DeclarationEntry />}
            <ClientAccountLink clientSpace={clientSpace} />
            <ProfessionalAccountLink clientSpace={clientSpace} />
          </nav>
        </div>
      </header>
      <div
        className={`mx-auto w-full min-w-0 max-w-7xl px-4 sm:px-6 ${compact ? "py-6" : "py-8 sm:py-12"}`}
      >
        {children}
      </div>
      <footer className="mx-auto flex max-w-7xl flex-wrap justify-between gap-4 border-t border-sanispa-line px-4 py-7 text-sm text-sanispa-steel"><span>SANISPA Support · Votre spa, bien accompagné</span><div className="flex flex-wrap gap-5"><Link href="/acces?next=compte" className="focus-ring rounded underline">Créer mon compte particulier</Link><Link href="/partenaire/inscription" className="focus-ring rounded underline">Devenir partenaire</Link><Link href="/admin/connexion" className="focus-ring rounded underline">Administration</Link></div></footer>
    </main>
  );
}
