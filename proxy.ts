import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate for admin pages: visitors without a session cookie are sent to
 * the login page before any admin UI renders. This is a UX convenience only —
 * real authorisation happens server-side in every admin page (requireAdminPage)
 * and every admin API route (adminRoute → requireAdminApi).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!request.cookies.get("tour_admin_session")?.value) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = pathname === "/admin" ? "" : `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
