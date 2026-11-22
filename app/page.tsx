import Link from "next/link";
import { AuthArrival } from "@/components/AuthArrival";
import { AppShell } from "@/components/AppShell";
import { DeclarationEntry } from "@/components/DeclarationEntry";
import { ButtonLink } from "@/components/Button";
import { LagoonHero } from "@/components/LagoonHero";

export default function HomePage() {
  return (
    <AppShell>
      <AuthArrival />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start">
        <div>
          <LagoonHero description="Choisissez le symptôme, décrivez ce que vous observez et ajoutez quelques photos pour orienter le prédiagnostic.">
            <DeclarationEntry home />
            <ButtonLink href="/espace-client" variant="secondary">Mon espace spa</ButtonLink>
          </LagoonHero>
          <p className="mt-4 text-sm"><Link href="/diagnostic?new=1&problemType=demenagement" className="focus-ring font-bold underline">Je souhaite déménager mon spa →</Link></p>
        </div>

        <div className="rounded-xl border border-sanispa-line bg-white p-5 sm:p-6">
          <div className="grid gap-4">
            {[
              {
                title: "Choisissez votre problème",
                text: "Des symptômes faciles à reconnaître, sans jargon.",
              },
              {
                title: "Montrez ce que vous voyez",
                text: "Quelques photos utiles, toujours sans démontage.",
              },
              {
                title: "Envoyez votre demande",
                text: "Vérifiez votre résumé : SANISPA pourra orienter la suite.",
              },
              {
                title: "Votre dossier à portée de main",
                text: "Retrouvez vos demandes, vos documents et vos spas dans votre espace.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="border-b border-sanispa-line pb-4 last:border-0 last:pb-0"
              >
                <h2 className="sanispa-display-title text-xl text-sanispa-navy">{item.title}</h2>
                <p className="mt-1 text-sm leading-6 text-sanispa-steel">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
