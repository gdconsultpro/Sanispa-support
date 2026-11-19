import Image from "next/image";
import Link from "next/link";
import { paymentsPaused } from "@/lib/commercial-mode";

export function AppShell({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <main className="app-background min-h-screen">
      {paymentsPaused() ? <div className="bg-sanispa-blue px-4 py-2 text-center text-xs font-medium text-white">Services gratuits pour les particuliers et les partenaires · Sans carte bancaire</div> : null}
      <header className="border-b border-white/80 bg-white/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
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
          <nav className="flex flex-wrap items-center justify-end gap-2 text-sm font-bold">
            <Link href="/premium" className="rounded-full border border-sanispa-line bg-white px-3 py-2 text-sanispa-navy focus-ring">{paymentsPaused() ? "Services gratuits" : "Premium"}</Link>
            <Link href="/diagnostic?new=1&problemType=demenagement" className="rounded-md border border-sanispa-line px-3 py-2 text-sanispa-navy focus-ring">Déménagement</Link>
            <Link
              href="/espace-client"
              className="rounded-md border border-sanispa-line px-3 py-2 text-sanispa-navy focus-ring"
            >
              Espace client
            </Link>
            <Link
              href="/partenaire/connexion"
              className="rounded-md border border-sanispa-line px-3 py-2 text-sanispa-navy focus-ring"
            >
              Partenaires
            </Link>
            <Link href="/visio" className="rounded-full border border-sanispa-line bg-white px-3 py-2 text-sanispa-navy focus-ring">Visio</Link>
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
