import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    message: "Les photos sont envoyées via /api/diagnostics afin de créer un dossier complet et cohérent."
  });
}
