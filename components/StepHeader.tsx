export function StepHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-sanispa-blue">{eyebrow}</p>
      <h1 className="text-2xl font-bold text-sanispa-navy sm:text-3xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-sanispa-steel">{description}</p>
    </div>
  );
}
