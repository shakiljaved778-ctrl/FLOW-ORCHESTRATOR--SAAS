import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowOrchestrator",
  description: "Embedded finance workflow orchestration for vertical SaaS in Qatar & the GCC.",
};

// ClerkProvider is intentionally NOT here. It is scoped to the routes that need
// auth (dashboard, sign-in, sign-up) so the public landing page renders even if
// Clerk keys are missing or misconfigured — a marketing page must never break
// because of an auth-provider setting.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
