"use client";
import { useId } from "react";
import { problemTypes } from "@/lib/questions";
import type { ProblemType } from "@/lib/types";

// The position identifies the corresponding square in the shared 3 × 4 photo sheet.
const previews: Record<ProblemType, { detail: string; position: string }> = {
  fuite: { detail: "De l’eau s’échappe ou le niveau baisse.", position: "0 0" },
  electrique: { detail: "Le spa ne s’allume plus ou le disjoncteur se déclenche.", position: "50% 0" },
  "traitement-eau": { detail: "Eau trouble, mousse, odeur ou résultats d’analyse.", position: "100% 0" },
  pompe: { detail: "Une pompe ou des jets ne fonctionnent plus.", position: "0 33.333%" },
  chauffage: { detail: "L’eau reste froide ou chauffe trop.", position: "50% 33.333%" },
  "clavier-ecran": { detail: "L’écran ou les commandes ne répondent plus.", position: "100% 33.333%" },
  filtration: { detail: "L’eau circule mal ou le cycle semble anormal.", position: "0 66.667%" },
  "bruit-anormal": { detail: "Vous entendez un bruit nouveau ou inhabituel.", position: "50% 66.667%" },
  autre: { detail: "Éclairage, soufflerie, accessoires ou symptôme difficile à identifier.", position: "100% 66.667%" },
  demenagement: { detail: "Transport du spa et accès aux deux adresses.", position: "0 100%" },
};

export function ProblemPicker({
  value,
  onChange,
}: {
  value: ProblemType | "";
  onChange: (value: ProblemType) => void;
}) {
  const id = useId();
  return (
    <fieldset className="min-w-0" aria-describedby={id + "-hint"}>
      <legend className="sanispa-display-title mb-2 text-2xl leading-tight sm:text-3xl">
        Que se passe-t-il avec votre spa ?
      </legend>
      <p id={id + "-hint"} className="mb-4 text-sm leading-relaxed text-sanispa-steel">
        Choisissez le symptôme principal. Décrivez simplement ce que vous observez.
      </p>
      <div className="problem-options">
        {problemTypes.map(problem => {
          const label = id + "-" + problem.value;
          const preview = previews[problem.value];
          return (
            <label key={problem.value} className="problem-option">
              <span className="problem-option__photo" style={{ backgroundPosition: preview.position }} aria-hidden="true" />
              <span className="min-w-0">
                <span id={label} className="block text-sm font-semibold leading-5 text-sanispa-navy sm:text-base sm:leading-6">
                  {problem.label}
                </span>
                <span id={label + "-details"} className="mt-1 block text-xs leading-relaxed text-sanispa-steel sm:text-sm">
                  {preview.detail}
                </span>
              </span>
              <input
                className="problem-option__radio"
                type="radio"
                name="problemType"
                value={problem.value}
                aria-labelledby={label}
                aria-describedby={label + "-details"}
                checked={value === problem.value}
                required
                onChange={() => onChange(problem.value)}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
