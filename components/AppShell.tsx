import Link from "next/link";

export function AppShell({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <main className="min-h-screen bg-sanispa-ice">
      <header className="border-b border-sanispa-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="inline-flex items-center focus-ring">
            <img
              src="https://www.sani-spa.fr/wp-contenus/uploads/2015/02/sani-spa-bottom-retina.png"
              alt="SANISPA"
              className="h-10 w-auto object-contain"
            />
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-2 text-sm font-bold">
            <Link href="/espace-client" className="rounded-md border border-sanispa-line px-3 py-2 text-sanispa-navy focus-ring">
              Espace client
            </Link>
            <Link href="/partenaire/connexion" className="rounded-md border border-sanispa-line px-3 py-2 text-sanispa-navy focus-ring">
              Partenaires
            </Link>
          </nav>
        </div>
      </header>
      <div className={`mx-auto w-full max-w-5xl px-4 ${compact ? "py-5" : "py-8"}`}>{children}</div>
    </main>
  );
}
