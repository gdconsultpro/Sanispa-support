import { redirect } from "next/navigation";
export default async function PaymentPage({ searchParams }: { searchParams: Promise<{ diagnosticId?: string }> }) {
  const id = (await searchParams).diagnosticId;
  redirect(id && /^[a-f0-9-]{36}$/i.test(id) ? `/premium/assistant?topic=eau&diagnosticId=${encodeURIComponent(id)}` : "/premium");
}
