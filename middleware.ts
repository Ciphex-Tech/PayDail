import { NextResponse, type NextRequest } from "next/server";

function base64Nonce(bytes: Uint8Array) {
  // Edge runtime base64 (Buffer is not available).
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64Nonce(bytes);
}

function buildCsp(nonce: string, req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let supabaseOrigin = "";
  let supabaseWsOrigin = "";
  if (supabaseUrl) {
    try {
      const parsed = new URL(supabaseUrl);
      supabaseOrigin = parsed.origin;
      supabaseWsOrigin = parsed.origin.replace(/^https?:\/\//, "wss://");
    } catch {
      supabaseOrigin = "";
      supabaseWsOrigin = "";
    }
  }

  const connectSrc = [
    "'self'",
    "https://api.paystack.co",
    "https://api.bitgo.com",
    "https://emailvalidation.abstractapi.com",
    "https://api.stripe.com",
    "https://www.paypal.com",
  ];

  if (supabaseOrigin) {
    connectSrc.push(supabaseOrigin);
  }

  if (supabaseWsOrigin) {
    connectSrc.push(supabaseWsOrigin);
  }

  // Note: Paystack commonly uses checkout.paystack.com in iframes.
  // We include it explicitly without wildcards.
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://js.paystack.co https://js.stripe.com https://www.paypal.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://api.qrserver.com",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-src https://js.paystack.co https://js.stripe.com https://www.paypal.com https://checkout.paystack.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ];

  // Dev-only violation logging endpoint.
  if (process.env.NODE_ENV !== "production") {
    csp.push("report-uri /api/csp-report");
  }

  return csp.join("; ");
}

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

  if (pathname.startsWith("/create-pin")) {
    const allowed = req.cookies.get("allow_create_pin")?.value === "true";
    if (!allowed) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  const nonce = generateNonce();
  const csp = buildCsp(nonce, req);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the nonce from the CSP *request* header during SSR.
  // We set it here so Next can automatically apply the nonce to its internal scripts.
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  res.headers.set("x-nonce", nonce);

  // In dev we use Report-Only to avoid breaking local dev while iterating.
  // In prod we enforce strictly.
  if (process.env.NODE_ENV !== "production") {
    res.headers.set("Content-Security-Policy-Report-Only", csp);
  } else {
    res.headers.set("Content-Security-Policy", csp);
  }

  return res;
}

export const config = {
  matcher: [
    // All pages (excluding Next internal assets)
    "/((?!_next/static|_next/image|favicon.ico).*)",
    // Keep existing API CORS handling
    "/api/:path*",
  ],
};
