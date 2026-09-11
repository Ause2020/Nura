import { isHiddenModulePath } from "@/lib/product/scope";
import { enforceRateLimit } from "@/lib/rate-limit";
import { updateSession } from "@/lib/supabase/middleware";
import { canAccessPath } from "@/lib/team/permissions";
import { NextResponse, type NextRequest } from "next/server";

const protectedPaths = [
  "/dashboard",
  "/analisis",
  "/planta",
  "/haccp",
  "/auditorias",
  "/capa",
  "/proveedores",
  "/capacitacion",
  "/reclamos",
  "/documentos",
  "/registros",
  "/trazabilidad",
  "/configuracion",
  "/admin",
  "/onboarding",
];

const dashboardPaths = [
  "/dashboard",
  "/analisis",
  "/planta",
  "/haccp",
  "/auditorias",
  "/capa",
  "/proveedores",
  "/capacitacion",
  "/reclamos",
  "/documentos",
  "/registros",
  "/trazabilidad",
  "/configuracion",
  "/admin",
];

export async function middleware(request: NextRequest) {
  const {
    supabaseResponse,
    user,
    onboardingCompleted,
    accessAllowed,
    platformAdmin,
    userRole,
  } = await updateSession(request);
  const { pathname } = request.nextUrl;

  try {
    const rateLimited = await enforceRateLimit({
      request,
      pathname,
      userId: user?.id ?? null,
    });
    if (rateLimited.response) {
      return rateLimited.response;
    }
  } catch {
    // Rate limiting must not take the app down.
  }

  if (isHiddenModulePath(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = user ? "/dashboard" : "/login";
    target.search = "";
    return NextResponse.redirect(target);
  }

  const isProtected = protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (
    user &&
    pathname.startsWith("/admin") &&
    !platformAdmin
  ) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  const isDashboardRoute = dashboardPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (
    user &&
    !accessAllowed &&
    !platformAdmin &&
    (isDashboardRoute || pathname.startsWith("/onboarding"))
  ) {
    const pendingUrl = request.nextUrl.clone();
    pendingUrl.pathname = "/acceso-pendiente";
    return NextResponse.redirect(pendingUrl);
  }

  if (user && !onboardingCompleted && isDashboardRoute && accessAllowed) {
    const onboardingUrl = request.nextUrl.clone();
    onboardingUrl.pathname = "/onboarding";
    return NextResponse.redirect(onboardingUrl);
  }

  if (user && onboardingCompleted && pathname.startsWith("/onboarding")) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  if (
    user &&
    userRole &&
    !platformAdmin &&
    isDashboardRoute &&
    !canAccessPath(userRole, pathname)
  ) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  if (user && (pathname === "/login" || pathname === "/register")) {
    const recoveryNext = request.nextUrl.searchParams.get("next");
    if (recoveryNext?.startsWith("/recuperar")) {
      return supabaseResponse;
    }
    if (!accessAllowed && !platformAdmin) {
      const pendingUrl = request.nextUrl.clone();
      pendingUrl.pathname = "/acceso-pendiente";
      return NextResponse.redirect(pendingUrl);
    }

    const target = request.nextUrl.clone();
    target.pathname = onboardingCompleted ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(target);
  }

  if (pathname === "/register") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("info", "manual-access");
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
