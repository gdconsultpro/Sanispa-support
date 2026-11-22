import Image from "next/image";

export function LagoonHero({ children, firstName, signedIn = false, description }: {
  children: React.ReactNode;
  firstName?: string;
  signedIn?: boolean;
  description?: string;
}) {
  const Heading = signedIn ? "h2" : "h1";

  return (
    <section aria-labelledby="lagoon-title" className={`lagoon-hero rounded-2xl px-5 py-6 sm:px-8 sm:py-9 ${signedIn ? "lagoon-hero--photo" : ""}`}>
      {signedIn ? (
        <>
          <div className="lagoon-hero__image">
            <Image src="/spa-accueil-lagon.webp" alt="" fill sizes="(max-width: 639px) 100vw, (max-width: 1280px) 63vw, 780px" />
          </div>
          <div className="lagoon-hero__shade" aria-hidden="true" />
        </>
      ) : null}
      <div className="relative max-w-md">
        {firstName?.trim() ? <p className="mb-2 break-words text-sm font-semibold text-[#def3ed]">Bonjour {firstName.trim()}</p> : null}
        <Heading id="lagoon-title" className="lagoon-hero__heading text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
          Un souci avec votre spa ?
        </Heading>
        {description ? <p className="mt-3 text-sm leading-6 text-[#def3ed] sm:text-base">{description}</p> : null}
        <div className="lagoon-actions mt-5 flex flex-wrap gap-2">{children}</div>
      </div>
    </section>
  );
}
