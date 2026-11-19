import { z } from "zod";
export const partnerRegistrationSchema = z.discriminatedUnion("mode",[
 z.object({mode:z.literal("claim")}).strict(),
 z.object({mode:z.literal("create"),companyName:z.string().trim().min(2).max(150),contactName:z.string().trim().min(2).max(150),phone:z.string().trim().min(6).max(30),address:z.string().trim().max(300),postalCode:z.string().regex(/^\d{5}$/),city:z.string().trim().min(1).max(120),departments:z.array(z.string().trim().toUpperCase().regex(/^(?:\d{2,3}|2[AB])$/)).min(1).max(101).transform(v=>[...new Set(v)])}).strict()
]);
export type PartnerOnboarding = {registered?:boolean;blocked?:boolean;message?:string;candidate?:{company_name:string;city:string|null}|null;partner?:{id:string;company_name:string};passwordChangeRequired?:boolean};
