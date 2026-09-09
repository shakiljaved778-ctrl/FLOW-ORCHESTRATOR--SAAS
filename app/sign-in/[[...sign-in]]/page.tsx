import { ClerkProvider, SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <ClerkProvider>
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <SignIn fallbackRedirectUrl="/dashboard" />
      </div>
    </ClerkProvider>
  );
}
