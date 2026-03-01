import { NextResponse, type NextRequest } from "next/server";

// Middleware is used here to protect the reset-password page from being accessed
// directly via URL manipulation.
//
// We gate access using an httpOnly cookie set only after successful OTP
// verification. Client state (localStorage/sessionStorage) is not trusted.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin");
    let allowedOrigin: string | null = null;

    if (origin) {
      try {
        const url = new URL(origin);
        const host = url.hostname.toLowerCase();
        const allowedHosts = new Set([
          "paydail.com",
          "www.paydail.com",
          "paydail.vercel.app",
          "app.paydail.com",
          "localhost",
          "127.0.0.1",
        ]);

        if (allowedHosts.has(host)) {
          allowedOrigin = origin;
        }
      } catch {
        allowedOrigin = null;
      }
    }

    const requestedHeaders = req.headers.get("access-control-request-headers");

    if (req.method === "OPTIONS") {
      const res = new NextResponse(null, { status: 204 });
      if (allowedOrigin) {
        res.headers.set("Access-Control-Allow-Origin", allowedOrigin);
        res.headers.set("Vary", "Origin");
        res.headers.set("Access-Control-Allow-Credentials", "true");
      }
      res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.headers.set(
        "Access-Control-Allow-Headers",
        requestedHeaders || "Content-Type, Authorization",
      );
      res.headers.set("Access-Control-Max-Age", "86400");
      return res;
    }

    const res = NextResponse.next();
    if (allowedOrigin) {
      res.headers.set("Access-Control-Allow-Origin", allowedOrigin);
      res.headers.set("Vary", "Origin");
      res.headers.set("Access-Control-Allow-Credentials", "true");
    }
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.headers.set(
      "Access-Control-Allow-Headers",
      requestedHeaders || "Content-Type, Authorization",
    );
    return res;
  }

  if (pathname.startsWith("/forgot-password/verify")) {
    const hasEmail = Boolean(req.cookies.get("fp_email")?.value);
    if (!hasEmail) {
      const url = req.nextUrl.clone();
      url.pathname = "/forgot-password";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/forgot-password/reset")) {
    const verified = req.cookies.get("fp_otp_verified")?.value === "true";
    if (!verified) {
      const url = req.nextUrl.clone();
      url.pathname = "/forgot-password";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/forgot-password/verify", "/forgot-password/reset", "/api/:path*"],
};
