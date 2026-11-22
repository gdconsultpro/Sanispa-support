import Image from "next/image";

export function LagoonHero({ children, firstName, signedIn = false, description }: {
  children: React.ReactNode;
  firstName?: string;
  signedIn?: boolean;
  description?: string;
}) {
  const Heading = signedIn ? "h2" : "h1";

  return (
    <section aria-labelledby="lagoon-title" className={`lagoon-hero rounded-xl px-5 py-7 sm:px-10 sm:py-12 ${signedIn ? "lagoon-hero--photo" : ""}`}>
      {signedIn ? (
        <>
          <div className="lagoon-hero__image">
            <Image src="/spa-accueil-lagon.webp" alt="" fill sizes="(max-width: 639px) 100vw, (max-width: 1280px) 63vw, 780px" />
          </div>
          <div className="lagoon-hero__shade" aria-hidden="true" />
        </>
      ) : null}
      <div className="relative max-w-md">
        {firstName?.trim() ? <p className="mb-2 break-words text-sm font-medium text-[#f3e8d6]">Bonjour {firstName.trim()}</p> : null}
        <Heading id="lagoon-title" className="sanispa-display-title lagoon-hero__heading text-4xl leading-tight sm:text-5xl lg:text-6xl">
          Un souci avec votre spa ?
        </Heading>
        {description ? <p className="mt-4 text-sm leading-6 text-[#e4e8ee] sm:text-base">{description}</p> : null}
        <div className="lagoon-actions mt-6 flex flex-wrap gap-2">{children}</div>
      </div>
    </section>
  );
}
