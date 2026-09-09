import { ClerkProvider, SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <ClerkProvider>
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <SignUp fallbackRedirectUrl="/dashboard" />
      </div>
    </ClerkProvider>
  );
}
