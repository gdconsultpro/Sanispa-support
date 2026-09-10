import { HttpError } from "./http";
const kinds: Record<string,{extensions:string[]; signature:(b:Buffer)=>boolean}> = {
  "application/pdf": {extensions:["pdf"], signature:b=>b.subarray(0,5).toString()==="%PDF-" && b.subarray(-2048).includes(Buffer.from("%%EOF"))},
  "image/png": {extensions:["png"], signature:b=>b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))},
  "image/jpeg": {extensions:["jpg","jpeg"], signature:b=>b[0]===255 && b[1]===216 && b[2]===255},
  "image/heic": {extensions:["heic"], signature:b=>b.subarray(4,8).toString()==="ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(b.subarray(8,12).toString())},
  "image/heif": {extensions:["heif","heic"], signature:b=>b.subarray(4,8).toString()==="ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(b.subarray(8,12).toString())},
  "application/msword": {extensions:["doc"], signature:b=>b.subarray(0,8).equals(Buffer.from([208,207,17,224,161,177,26,225]))},
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {extensions:["docx"], signature:b=>b.subarray(0,4).equals(Buffer.from([80,75,3,4])) && b.includes(Buffer.from("[Content_Types].xml")) && b.includes(Buffer.from("word/document.xml"))}
};
export function validateDocument(name: string, mime: string, bytes: Buffer) {
  const kind = kinds[mime], extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (!bytes.length || bytes.length > 3*1024*1024) throw new HttpError(413,"Le fichier doit contenir entre 1 octet et 3 Mo.");
  if (name.length > 180 || /[\x00-\x1f\x7f/\\]/.test(name) || !kind?.extensions.includes(extension) || !kind.signature(bytes))
    throw new HttpError(400,"Le contenu du fichier ne correspond pas à un format autorisé (PDF, photo ou Word).");
}
export function attachmentDisposition(name: string) {
  const cleaned = name.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,180);
  const ascii = cleaned.replace(/[^a-zA-Z0-9._ -]/g,'_');
  return `attachment; filename="${ascii || 'document'}"; filename*=UTF-8''${encodeURIComponent(cleaned).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`;
}
