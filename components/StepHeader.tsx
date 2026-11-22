export function StepHeader({
  eyebrow,
  title,
  description,
  labels = ["Votre spa", "Les symptômes", "Les photos", "Le résumé"],
}: {
  eyebrow: string;
  title: string;
  description: string;
  labels?: string[];
}) {
  const step = Number(eyebrow.match(/^Étape ([1-4])$/)?.[1] || 0);
  return (
    <div className="mb-6">
      {step ? (
        <nav aria-label="Étapes de votre déclaration" className="mb-5 sm:mb-7">
          <ol className={`grid gap-1.5 sm:gap-3 ${labels.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
            {labels.map(
              (label, index) => (
                <li
                  key={label}
                  aria-current={step === index + 1 ? "step" : undefined}
                  className={`declaration-step px-1 py-2 text-center text-[11px] font-semibold leading-tight sm:px-3 sm:py-3 sm:text-left sm:text-sm ${index + 1 < step ? "declaration-step--complete" : ""}`}
                >
                  <span className="mb-1 block text-xs font-semibold tabular-nums sm:mb-0 sm:mr-2 sm:inline">
                    {index + 1 < step ? "✓" : index + 1}
                  </span>
                  {label}
                </li>
              ),
            )}
          </ol>
        </nav>
      ) : null}
      {step ? null : <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-sanispa-blue">{eyebrow}</p>}
      <h1 className="sanispa-display-title text-3xl leading-tight text-sanispa-navy sm:text-5xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-sanispa-steel">
        {description}
      </p>
    </div>
  );
}
