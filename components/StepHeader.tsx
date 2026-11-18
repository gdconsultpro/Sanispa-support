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
        <nav aria-label="Étapes de votre déclaration" className="mb-6">
          <ol className={`grid gap-2 ${labels.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
            {labels.map(
              (label, index) => (
                <li
                  key={label}
                  aria-current={step === index + 1 ? "step" : undefined}
                  className={`rounded-2xl px-2 py-3 text-center text-xs font-bold sm:text-sm ${index + 1 <= step ? "bg-sanispa-blue text-white" : "bg-white text-sanispa-steel"}`}
                >
                  <span className="block text-base">
                    {index + 1 < step ? "✓" : index + 1}
                  </span>
                  {label}
                </li>
              ),
            )}
          </ol>
        </nav>
      ) : null}
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-sanispa-blue">
        {eyebrow}
      </p>
      <h1 className="text-2xl font-bold text-sanispa-navy sm:text-3xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-sanispa-steel">
        {description}
      </p>
    </div>
  );
}
