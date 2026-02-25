import { NextResponse, type NextRequest } from "next/server";

// Middleware is used here to protect the reset-password page from being accessed
// directly via URL manipulation.
//
// We gate access using an httpOnly cookie set only after successful OTP
// verification. Client state (localStorage/sessionStorage) is not trusted.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
  matcher: ["/forgot-password/verify", "/forgot-password/reset"],
};
