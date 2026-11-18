import Image from "next/image";
import Link from "next/link";

export function AppShell({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <main className="app-background min-h-screen">
      <header className="border-b border-white/80 bg-white/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="inline-flex items-center focus-ring">
            <Image
              src="/sanispa-logo.png"
              width={120}
              height={72}
              priority
              alt="SANISPA"
              className="h-10 w-auto object-contain"
            />
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-2 text-sm font-bold">
            <Link href="/premium" className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sanispa-navy focus-ring">Premium</Link>
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
          </nav>
        </div>
      </header>
      <div
        className={`mx-auto w-full max-w-5xl px-4 ${compact ? "py-5" : "py-8"}`}
      >
        {children}
      </div>
      <footer className="mx-auto flex max-w-5xl flex-wrap justify-between gap-4 border-t border-sanispa-line px-4 py-6 text-sm text-sanispa-steel"><span>SANISPA Support</span><div className="flex flex-wrap gap-5"><Link href="/demo" className="focus-ring rounded underline">Essayer la démo</Link><Link href="/admin/connexion" className="focus-ring rounded underline">Administration</Link></div></footer>
    </main>
  );
}
