import Link from "next/link";

export function AppShell({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <main className="min-h-screen bg-sanispa-ice">
      <header className="border-b border-sanispa-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-bold tracking-wide text-sanispa-navy">
            SANISPA
          </Link>
        </div>
      </header>
      <div className={`mx-auto w-full max-w-5xl px-4 ${compact ? "py-5" : "py-8"}`}>{children}</div>
    </main>
  );
}
