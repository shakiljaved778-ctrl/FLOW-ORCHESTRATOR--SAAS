import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Clerk middleware. Public: landing page, sign-in/up, and PSP webhooks
 * (authenticated by signature, not a session). Everything else — the
 * dashboard and the v1 API — requires authentication.
 *
 * The v1 API is additionally guarded by API-key checks inside each route;
 * Clerk here just blocks unauthenticated browser access to the dashboard.
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/(.*)",
  "/api/v1/(.*)", // API-key auth handled in-route
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
