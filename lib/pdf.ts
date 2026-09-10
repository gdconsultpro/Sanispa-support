import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
export async function buildSummaryPdf(lines: string[]) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let page = pdf.addPage([595, 842]);
    let y = 790;
    const printable = (value: string) => Array.from(value.replace(/[\u202f\u00a0]/g, " ")).map(c => { try {
        font.encodeText(c);
        return c;
    }
    catch {
        return "?";
    } }).join("");
    for (const raw of lines) {
        let line = "";
        const chunks: string[] = [];
        for (const c of printable(raw)) {
            if (font.widthOfTextAtSize(line + c, 10) > 495) {
                chunks.push(line);
                line = "";
            }
            line += c;
        }
        chunks.push(line);
        for (const text of chunks) {
            if (y < 55) {
                page = pdf.addPage([595, 842]);
                y = 790;
            }
            page.drawText(text, { x: 50, y, size: 10, font, color: rgb(.04, .14, .26) });
            y -= 15;
        }
    }
    const count = pdf.getPageCount();
    pdf.getPages().forEach((p, i) => p.drawText(`SANISPA · ${i + 1}/${count}`, { x: 50, y: 25, size: 9, font }));
    return Buffer.from(await pdf.save());
}
