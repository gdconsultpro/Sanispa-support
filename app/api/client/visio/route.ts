import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { createVideoRequest, listVideoRequests } from "@/lib/video-assistance";
export async function GET(request: Request) {
  try { return NextResponse.json(await listVideoRequests(request, "customer"), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try { return NextResponse.json(await createVideoRequest(request, "customer"), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}
