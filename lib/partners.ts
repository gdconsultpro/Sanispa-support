export function getDepartmentFromPostalCode(postalCode?: string | null) {
  const digits = (postalCode ?? "").replace(/\D/g, "");
  if (digits.length < 2) return "";

  if (digits.startsWith("97") || digits.startsWith("98")) {
    return digits.slice(0, 3);
  }

  return digits.slice(0, 2);
}
