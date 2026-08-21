import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";

const publicExact = new Set(["/login", "/register", "/api/health"]);
const protectedPagePrefixes = ["/", "/inventory", "/suppliers", "/purchases", "/sales", "/accounting", "/employees", "/payroll", "/onboarding"];
const publicApiPrefixes = ["/api/auth/", "/api/public/"];

function isProtectedPage(pathname: string) {
  if (pathname === "/") return true;
  return protectedPagePrefixes.slice(1).some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const publicApi = publicApiPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (publicExact.has(pathname) || publicApi) {
    if (hasSessionCookie && (pathname === "/login" || pathname === "/register")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/") && !hasSessionCookie) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (isProtectedPage(pathname) && !hasSessionCookie) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
