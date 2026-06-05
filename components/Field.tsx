"use client";

type FieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
};

export function Field({ label, name, value, onChange, required, type = "text", placeholder }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-sanispa-navy">
        {label}
        {required ? <span className="text-sanispa-blue"> *</span> : null}
      </span>
      <input
        className="focus-ring min-h-12 w-full rounded-md border border-sanispa-line bg-white px-4 py-3 text-base text-sanispa-navy placeholder:text-sanispa-steel"
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        placeholder={placeholder}
      />
    </label>
  );
}

export function SelectField({
  label,
  name,
  value,
  onChange,
  required,
  options
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-sanispa-navy">
        {label}
        {required ? <span className="text-sanispa-blue"> *</span> : null}
      </span>
      <select
        className="focus-ring min-h-12 w-full rounded-md border border-sanispa-line bg-white px-4 py-3 text-base text-sanispa-navy"
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      >
        <option value="">Sélectionner</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextAreaField({
  label,
  name,
  value,
  onChange,
  required
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-sanispa-navy">
        {label}
        {required ? <span className="text-sanispa-blue"> *</span> : null}
      </span>
      <textarea
        className="focus-ring min-h-28 w-full rounded-md border border-sanispa-line bg-white px-4 py-3 text-base text-sanispa-navy"
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </label>
  );
}
