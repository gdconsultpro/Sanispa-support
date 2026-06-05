import Link from "next/link";
import { ArrowRight } from "lucide-react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

const variants = {
  primary: "bg-sanispa-navy text-white hover:bg-sanispa-blue",
  secondary: "border border-sanispa-line bg-white text-sanispa-navy hover:border-sanispa-blue",
  ghost: "bg-transparent text-sanispa-navy hover:bg-white"
};

export function Button({ className = "", variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-bold transition focus-ring disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary"
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-bold transition focus-ring ${variants[variant]}`}
    >
      {children}
      <ArrowRight size={18} aria-hidden="true" />
    </Link>
  );
}
