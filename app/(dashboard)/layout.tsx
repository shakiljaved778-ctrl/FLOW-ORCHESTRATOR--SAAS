import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/transactions", label: "Transactions" },
  { href: "/ledger", label: "Ledger" },
  { href: "/reconciliation", label: "Reconciliation" },
  { href: "/audit", label: "Audit" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/settings/branding", label: "Branding" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4">
        <div className="px-2 text-lg font-bold text-slate-900">FlowOrchestrator</div>
        <nav className="mt-6 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/" />
          <UserButton />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
