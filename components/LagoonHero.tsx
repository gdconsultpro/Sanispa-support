import Image from "next/image";

export function LagoonHero({ children, firstName, signedIn = false, description, casePreview }: {
  children: React.ReactNode;
  firstName?: string;
  signedIn?: boolean;
  description?: string;
  casePreview?: React.ReactNode;
}) {
  return (
    <section aria-labelledby="spa-hero-title" className={`cobalt-hero rounded-2xl p-4 sm:p-6 ${signedIn ? "grid gap-4" : ""}`}>
      <div className={signedIn ? "flex flex-wrap items-end justify-between gap-x-5 gap-y-4" : "max-w-md py-3 sm:py-6"}>
        <div>
          {firstName?.trim() ? <p className="mb-2 break-words text-sm font-medium text-white/90">Bonjour {firstName.trim()}</p> : null}
          <h1 id="spa-hero-title" className="sanispa-display-title text-3xl leading-tight sm:text-5xl">
            {signedIn ? "Mon espace spa" : "Un souci avec votre spa ?"}
          </h1>
          {description ? <p className="mt-4 text-sm leading-6 text-white/90 sm:text-base">{description}</p> : null}
        </div>
        <div className={`cobalt-hero__actions flex flex-wrap gap-2 ${signedIn ? "" : "mt-6"}`}>{children}</div>
      </div>
      {signedIn ? (
        <div className={`grid gap-3 ${casePreview ? "sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" : ""}`}>
          <div className="cobalt-hero__image relative min-h-48 overflow-hidden rounded-xl sm:min-h-64">
            <Image
              src="/spa-accueil-onlyspa.webp"
              alt="Spa Onlyspa intégré à une terrasse en bois"
              fill
              sizes={casePreview ? "(max-width: 639px) 100vw, (max-width: 1280px) 60vw, 720px" : "(max-width: 1280px) 100vw, 1200px"}
              priority
            />
          </div>
          {casePreview}
        </div>
      ) : null}
    </section>
  );
}
