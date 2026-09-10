import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { validateDocument, attachmentDisposition } from '../lib/documents';
import { readBytes } from '../lib/http';

test('uploads reject forged MIME types, double extensions and header injection', async()=>{
 const pdf=await PDFDocument.create();pdf.addPage();const bytes=Buffer.from(await pdf.save());
 assert.doesNotThrow(()=>validateDocument('facture été.pdf','application/pdf',bytes));
 for(const [name,mime,b] of [['faux.pdf','application/pdf',Buffer.from('<html><script>alert(1)</script></html>')],['facture.pdf.exe','application/pdf',bytes],['facture\r\nInjected.pdf','application/pdf',bytes],['faux.png','image/png',bytes]] as const) assert.throws(()=>validateDocument(name,mime,b));
 const header=attachmentDisposition('Facture été "\r\n.pdf');
 assert(!header.includes('\r'));assert(!header.includes('\n'));assert.match(header,/filename\*=UTF-8''Facture%20/);
});
test('multipart request size is bounded even without a Content-Length header',async()=>{
 const request=new Request('https://app.example.invalid/api',{method:'POST',body:'a'.repeat(101)});
 await assert.rejects(readBytes(request,100),/volumineux/);
});
