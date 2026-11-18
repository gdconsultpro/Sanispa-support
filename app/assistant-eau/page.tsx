import { redirect } from "next/navigation";
// The former one-off water service now uses the same complimentary assistant.
export default function WaterAssistantPage() { redirect("/premium/assistant?topic=eau"); }
