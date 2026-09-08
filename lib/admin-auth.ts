import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
export function adminAuthorized(authorization: string | null) {
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    if (!username || !password || !authorization?.startsWith("Basic "))
        return false;
    const received = Buffer.from(authorization.slice(6), "base64");
    const expected = Buffer.from(`${username}:${password}`);
    return received.length === expected.length && timingSafeEqual(received, expected);
}
export function adminDenied(request: Request) {
    const origin = request.headers.get("origin");
    if (!["GET", "HEAD"].includes(request.method) && origin && origin !== new URL(request.url).origin && origin !== process.env.NEXT_PUBLIC_APP_URL) {
        return NextResponse.json({error: "Origine de la requête refusée."}, {status: 403});
    }
    return adminAuthorized(request.headers.get("authorization")) ? null : NextResponse.json({error: "Accès administrateur requis."}, {status: 401});
}
