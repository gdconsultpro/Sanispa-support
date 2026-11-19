import { paymentsPaused } from "@/lib/commercial-mode";
import { AuthArrival } from "@/components/AuthArrival";
import { ClipboardCheck, ImagePlus, ShieldCheck, Wrench } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ButtonLink } from "@/components/Button";
export default function HomePage() {
  return (
    <AppShell>
      <AuthArrival />
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-sanispa-blue">
            Pré-diagnostic technique de spa
          </p>
          <h1 className="text-4xl font-bold leading-tight text-sanispa-navy sm:text-5xl">
            Votre spa a un souci ? On vous aide à y voir plus clair.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-sanispa-steel">
            Décrivez ce que vous constatez, laissez-vous guider et ajoutez
            quelques photos. Nous aurons les bons éléments pour orienter votre
            demande. Aucune connaissance technique nécessaire.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <ButtonLink href="/diagnostic?new=1">Déclarer ma panne gratuitement</ButtonLink>
            <ButtonLink href="/premium" variant="secondary">{paymentsPaused() ? "Découvrir les services gratuits" : "Découvrir Premium — 9,99 € / mois"}</ButtonLink>
            <ButtonLink href="/diagnostic?new=1&problemType=demenagement" variant="secondary">Déménager mon spa</ButtonLink>
            <ButtonLink href="/espace-client" variant="secondary">
              Mon compte
            </ButtonLink>
            <ButtonLink href="/partenaire/connexion" variant="secondary">
              Espace professionnel
            </ButtonLink>
          </div>
        </div>

        <div className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
          <div className="grid gap-4">
            {[
              {
                icon: ClipboardCheck,
                title: "1. Choisissez votre problème",
                text: "Des symptômes faciles à reconnaître, sans jargon.",
              },
              {
                icon: ImagePlus,
                title: "2. Montrez ce que vous voyez",
                text: "Quelques photos utiles, toujours sans démontage.",
              },
              {
                icon: Wrench,
                title: "3. Envoyez votre demande",
                text: "Vérifiez votre résumé : SANISPA pourra orienter la suite.",
              },
              {
                icon: ShieldCheck,
                title: "Votre dossier à portée de main",
                text: "Retrouvez vos demandes, vos documents et vos spas dans votre espace.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex gap-4 border-b border-sanispa-line pb-4 last:border-0 last:pb-0"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-sanispa-ice text-sanispa-blue">
                  <item.icon size={22} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-bold text-sanispa-navy">{item.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-sanispa-steel">
                    {item.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
