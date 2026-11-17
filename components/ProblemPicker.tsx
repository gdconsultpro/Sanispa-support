"use client";
import {
  Droplets,
  PlugZap,
  Waves,
  Fan,
  Thermometer,
  PanelTop,
  Filter,
  Volume2,
  CircleHelp,
} from "lucide-react";
import { problemTypes } from "@/lib/questions";
import type { ProblemType } from "@/lib/types";
const icons = [
  Droplets,
  PlugZap,
  Waves,
  Fan,
  Thermometer,
  PanelTop,
  Filter,
  Volume2,
  CircleHelp,
];
const examples = [
  "De l’eau s’échappe ou le niveau baisse",
  "Plus de courant ou une protection déclenche",
  "Eau trouble, mousse, odeur ou analyse",
  "Une pompe ou des jets ne fonctionnent plus",
  "L’eau ne chauffe pas ou chauffe trop",
  "Affichage ou commandes qui ne répondent plus",
  "L’eau circule mal ou le cycle semble anormal",
  "Un bruit nouveau ou inhabituel",
  "Éclairage, soufflerie, accessoires…",
];
export function ProblemPicker({
  value,
  onChange,
}: {
  value: ProblemType | "";
  onChange: (value: ProblemType) => void;
}) {
  return (
    <fieldset className="col-span-full">
      <legend className="mb-2 text-xl font-bold">
        Que se passe-t-il avec votre spa ? *
      </legend>
      <p className="mb-4 text-sm text-sanispa-steel">
        Choisissez le symptôme principal. Pas besoin d’en connaître la cause.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {problemTypes.map((problem, index) => {
          const Icon = icons[index];
          return (
            <label
              key={problem.value}
              className={`problem-card ${value === problem.value ? "is-selected" : ""}`}
            >
              <input
                className="peer sr-only"
                type="radio"
                name="problemType"
                value={problem.value}
                checked={value === problem.value}
                required
                onChange={() => onChange(problem.value)}
              />
              <span className="flex items-center gap-3 font-bold peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-sanispa-blue">
                <Icon size={23} aria-hidden="true" />
                {problem.label}
              </span>
              <span className="mt-2 block text-sm leading-6 text-sanispa-steel">
                {examples[index]}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
