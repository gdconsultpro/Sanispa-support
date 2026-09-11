import { NextResponse } from "next/server";
import { z } from "zod";
import { administrator, requireSameOrigin } from "@/lib/admin-auth";
import { apiError, readJson } from "@/lib/http";
import { processNotifications } from "@/lib/notifications";
import { decidePartnerDispatch, dispatchCommand, loadPartnerDispatch } from "@/lib/admin-partner-dispatch";
const headers={"Cache-Control":"private, no-store"};
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context) {
  try {
    const {supabase}=await administrator(request.headers);
    const id=z.string().uuid().parse((await params).id);
    return NextResponse.json(await loadPartnerDispatch(supabase,id),{headers});
  } catch(error) {return apiError(error);}
}
export async function POST(request:Request,{params}:Context) {
  try {
    const {supabase,user}=await administrator(request.headers); requireSameOrigin(request);
    const id=z.string().uuid().parse((await params).id);
    const command=dispatchCommand.parse(await readJson(request,1024));
    const result=await decidePartnerDispatch(supabase,id,user.id,command);
    if(result.notificationKey) {
      try {await processNotifications(result.notificationKey);} catch { /* The persisted queue state is reported below. */ }
    }
    return NextResponse.json({saved:true,changed:result.changed,...await loadPartnerDispatch(supabase,id)},{headers});
  } catch(error) {return apiError(error);}
}
