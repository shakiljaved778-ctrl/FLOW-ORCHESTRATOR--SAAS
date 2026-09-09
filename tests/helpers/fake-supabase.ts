import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A minimal in-memory Supabase double covering exactly the query-builder surface
 * the orchestrator, ledger, and audit code use:
 *
 *   from(t).select(cols).eq()..maybeSingle()/single()
 *   from(t).insert(obj|obj[]).select(cols).single()
 *   from(t).update(patch).eq()
 *   rpc("post_journal_entry", args)
 *
 * Builders are thenable, so `await query` resolves to { data, error } just like
 * the real client. State is a plain map of table → rows, inspectable in tests.
 */

type Row = Record<string, unknown>;
type Filter = [string, "eq" | "in", unknown];

export class FakeSupabase {
  tables: Record<string, Row[]> = {
    organizations: [],
    accounts: [],
    payments: [],
    payment_attempts: [],
    journal_entries: [],
    line_items: [],
    audit_logs: [],
    usage_records: [],
    settlements: [],
    webhook_events: [],
    api_keys: [],
  };

  /** Composite unique keys, mirroring the real schema's UNIQUE constraints. */
  private uniqueKeys: Record<string, string[]> = {
    webhook_events: ["provider", "external_id"],
    settlements: ["org_id", "provider", "provider_ref"],
    payments: ["org_id", "idempotency_key"],
  };

  seed(table: string, rows: Row[]): void {
    this.tables[table] = [...(this.tables[table] ?? []), ...rows];
  }

  from(table: string) {
    if (!this.tables[table]) this.tables[table] = [];
    return new Query(this.tables[table], this.uniqueKeys[table]);
  }

  async rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> {
    if (fn === "post_journal_entry") {
      const lines = (args.p_lines as Row[]) ?? [];
      const totalDebit = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
      const totalCredit = lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
      if (lines.length < 2 || totalDebit !== totalCredit) {
        return { data: null, error: { message: "Unbalanced journal entry" } };
      }
      const entryId = randomUUID();
      this.tables.journal_entries.push({
        id: entryId,
        org_id: args.p_org_id,
        description: args.p_description,
        transaction_id: args.p_transaction_id ?? null,
        provider: args.p_provider ?? null,
      });
      for (const l of lines) {
        this.tables.line_items.push({ id: randomUUID(), entry_id: entryId, ...l });
      }
      return { data: entryId, error: null };
    }
    return { data: null, error: { message: `Unknown rpc ${fn}` } };
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private filters: Filter[] = [];
  private mode: "many" | "single" | "maybe" = "many";
  private selected = false;

  constructor(
    private store: Row[],
    private uniqueKey?: string[],
  ) {}

  /** True if inserting `row` would violate the table's composite unique key.
   *  Nulls never collide (matching Postgres UNIQUE semantics). */
  private violatesUnique(row: Row): boolean {
    if (!this.uniqueKey) return false;
    const vals = this.uniqueKey.map((k) => row[k]);
    if (vals.some((v) => v === null || v === undefined)) return false;
    return this.store.some((existing) => this.uniqueKey!.every((k) => existing[k] === row[k]));
  }

  select(_cols?: string) {
    if (this.op !== "insert" && this.op !== "update") this.op = "select";
    this.selected = true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  upsert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, "eq", val]);
    return this;
  }
  in(col: string, arr: unknown[]) {
    this.filters.push([col, "in", arr]);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every(([col, kind, val]) =>
      kind === "in" ? (val as unknown[]).includes(row[col]) : row[col] === val,
    );
  }

  private run(): { data: unknown; error: unknown } {
    if (this.op === "insert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload!];
      for (const r of rows) {
        if (this.violatesUnique(r)) {
          return { data: null, error: { message: "duplicate key value violates unique constraint" } };
        }
      }
      const inserted = rows.map((r) => {
        const withId = { id: r.id ?? randomUUID(), ...r };
        this.store.push(withId);
        return withId;
      });
      if (!this.selected) return { data: null, error: null };
      return { data: this.mode === "many" ? inserted : inserted[0] ?? null, error: null };
    }

    if (this.op === "update") {
      const hits = this.store.filter((r) => this.matches(r));
      for (const r of hits) Object.assign(r, this.payload);
      return { data: this.selected ? hits : null, error: null };
    }

    if (this.op === "delete") {
      for (let i = this.store.length - 1; i >= 0; i--) {
        if (this.matches(this.store[i])) this.store.splice(i, 1);
      }
      return { data: null, error: null };
    }

    // select
    const hits = this.store.filter((r) => this.matches(r));
    if (this.mode === "single" || this.mode === "maybe") {
      return { data: hits[0] ?? null, error: null };
    }
    return { data: hits, error: null };
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    try {
      return Promise.resolve(onfulfilled ? onfulfilled(this.run()) : (this.run() as unknown as TResult1));
    } catch (e) {
      return Promise.resolve(onrejected ? onrejected(e) : (Promise.reject(e) as PromiseLike<TResult2>));
    }
  }
}
