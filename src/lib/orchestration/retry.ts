import type { ChargeInput, ChargeResult, PSP } from "./types";
import type { PaymentProvider } from "@/lib/providers/provider.interface";

export interface AttemptRecord {
  provider: PSP;
  attemptNumber: number;
  result: ChargeResult;
}

export interface ExecuteResult {
  /** The successful result, or the last failure if all candidates failed. */
  final: ChargeResult;
  succeeded: boolean;
  attempts: AttemptRecord[];
}

/**
 * Execute a charge against the ordered candidate providers, failing over to the
 * next one on failure. The full attempt history is returned so it can be
 * persisted to `payment_attempts` for audit and reconciliation.
 *
 * `resolveProvider` maps a PSP id to its adapter (injected for testability).
 */
export async function executeWithFailover(
  candidates: PSP[],
  input: ChargeInput,
  resolveProvider: (id: PSP) => PaymentProvider,
): Promise<ExecuteResult> {
  const attempts: AttemptRecord[] = [];
  let last: ChargeResult | undefined;

  for (let i = 0; i < candidates.length; i++) {
    const psp = candidates[i];
    const provider = resolveProvider(psp);
    const result = await provider.charge(input);
    attempts.push({ provider: psp, attemptNumber: i + 1, result });
    last = result;

    if (result.success) {
      return { final: result, succeeded: true, attempts };
    }
    // else: fall through to the next candidate (failover)
  }

  return {
    final:
      last ?? {
        provider: candidates[0],
        success: false,
        status: "failed",
        errorCode: "NO_CANDIDATES",
        errorMessage: "No provider candidates were available to attempt.",
      },
    succeeded: false,
    attempts,
  };
}
