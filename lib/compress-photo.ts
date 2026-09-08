export async function compressPhoto(file: File): Promise<string> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new Error("Choisissez une photo JPG, PNG ou WebP. Pour une photo HEIC, exportez-la en JPG.");
    if (file.size > 20 * 1024 * 1024)
        throw new Error("Cette photo dépasse 20 Mo.");
    const bitmap = await createImageBitmap(file);
    try {
        let scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
        for (let attempt = 0; attempt < 5; attempt++) {
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const ctx = canvas.getContext("2d");
            if (!ctx)
                throw new Error("Traitement photo indisponible.");
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const data = canvas.toDataURL("image/jpeg", .78);
            if (data.length <= 400000)
                return data;
            scale *= .75;
        }
        throw new Error("Cette photo est trop volumineuse. Choisissez une autre image.");
    }
    finally {
        bitmap.close();
    }
}
