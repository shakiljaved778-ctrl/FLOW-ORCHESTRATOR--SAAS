import { describe, it, expect } from "vitest";
import { buildAuditPdf } from "@/lib/audit/pdf";

describe("audit PDF report", () => {
  it("produces a valid PDF document with rows across pages", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({
      action: "payment.created",
      resource_type: "payment",
      resource_id: `pay_${i}`,
      user_id: i % 2 ? "user_abc" : null,
      occurred_at: new Date(Date.now() - i * 1000).toISOString(),
    }));

    const bytes = await buildAuditPdf(
      { orgName: "Demo", orgId: "org_1", generatedBy: "user_admin" },
      rows,
    );

    expect(bytes.byteLength).toBeGreaterThan(1000);
    // PDF magic number: %PDF
    const header = String.fromCharCode(...bytes.slice(0, 4));
    expect(header).toBe("%PDF");
  });

  it("handles an empty audit log", async () => {
    const bytes = await buildAuditPdf({ orgName: "Empty", orgId: "org_2", generatedBy: "u" }, []);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
  });
});
