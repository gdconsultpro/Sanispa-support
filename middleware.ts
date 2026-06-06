import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    return new NextResponse("Protection admin non configuree.", { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) {
    return unauthorized();
  }

  const credentials = decodeBasicAuth(authorization);
  if (!credentials || credentials.username !== username || credentials.password !== password) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};

function unauthorized() {
  return new NextResponse("Acces admin protege.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="SANISPA Admin"'
    }
  });
}

function decodeBasicAuth(authorization: string) {
  try {
    const encoded = authorization.replace("Basic ", "");
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return null;

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return null;
  }
}
