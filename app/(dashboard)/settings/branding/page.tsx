import { getDashboardData } from "@/lib/dashboard/context";
import { PageHeader, EmptyState } from "@/components/dashboard/ui";
import { updateBranding } from "@/lib/dashboard/actions";

export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  const { db, orgId, isAdmin } = await getDashboardData();

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Branding" />
        <EmptyState message="Only organization admins can update branding." />
      </div>
    );
  }

  const { data: org } = await db
    .from("organizations")
    .select("name, logo_url, brand_color, custom_domain")
    .eq("id", orgId)
    .single();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="White-label branding"
        subtitle="Customize the dashboard your platform's users see."
      />
      <form action={updateBranding} className="card space-y-4">
        <Field label="Logo URL" name="logo_url" defaultValue={org?.logo_url ?? ""} placeholder="https://…/logo.svg" />
        <Field label="Brand color (hex)" name="brand_color" defaultValue={org?.brand_color ?? ""} placeholder="#0f172a" />
        <Field label="Custom domain (CNAME)" name="custom_domain" defaultValue={org?.custom_domain ?? ""} placeholder="pay.yourplatform.com" />
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Save branding
        </button>
      </form>
    </div>
  );
}

function Field({ label, name, defaultValue, placeholder }: { label: string; name: string; defaultValue: string; placeholder: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );
}
