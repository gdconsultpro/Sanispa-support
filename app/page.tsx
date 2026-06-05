import { ClipboardCheck, ImagePlus, ShieldCheck, Wrench } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ButtonLink } from "@/components/Button";

export default function HomePage() {
  return (
    <AppShell>
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-sanispa-blue">Pré-diagnostic technique de spa</p>
          <h1 className="text-4xl font-bold leading-tight text-sanispa-navy sm:text-5xl">
            Déclarez une panne de spa avec les bons éléments dès le départ.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-sanispa-steel">
            SANISPA collecte vos informations, vos réponses guidées et vos photos pour orienter rapidement votre demande vers une intervention, un devis ou un accompagnement à distance.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/diagnostic">Démarrer un diagnostic</ButtonLink>
            <ButtonLink href="/admin" variant="secondary">Voir le dashboard</ButtonLink>
          </div>
        </div>

        <div className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
          <div className="grid gap-4">
            {[
              { icon: ClipboardCheck, title: "Questionnaire adapté", text: "Les questions changent selon la panne déclarée." },
              { icon: ImagePlus, title: "Photos obligatoires", text: "Clavier et compartiment technique demandés avant validation." },
              { icon: Wrench, title: "Orientation claire", text: "Intervention, devis ou assistance payante à distance." },
              { icon: ShieldCheck, title: "Dossier structuré", text: "Résumé exploitable par SANISPA côté admin." }
            ].map((item) => (
              <div key={item.title} className="flex gap-4 border-b border-sanispa-line pb-4 last:border-0 last:pb-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-sanispa-ice text-sanispa-blue">
                  <item.icon size={22} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-bold text-sanispa-navy">{item.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-sanispa-steel">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
