/**
 * Simulate + settle the atomic group.
 *
 * simulate() is a HARD gate: a group that fails the dry run is NEVER submitted,
 * so a bad group costs the agent exactly zero. Proven in Phase 0.
 *
 * Settlement is direct algokit submission (agent signs its legs and pays fees).
 * A facilitator-feePayer path is attempted first for fee abstraction; on any
 * facilitator error we fall back to direct submission so atomicity always holds.
 */
import { AxisError } from "@axis/shared";

export interface SettleResult {
  groupId: string;
  txids: string[];
  confirmedRound: number;
}

/** Dry run. Throws SIMULATION_FAILED with the failing leg — nothing submitted. */
export async function simulate(group: ReturnType<any>): Promise<void> {
  let failure: string | undefined;
  try {
    const sim = await group.simulate({ skipSignatures: true });
    failure = sim.simulateResponse?.txnGroups?.[0]?.failureMessage;
  } catch (e) {
    failure = (e as Error).message.split("\n")[0];
  }
  if (failure) {
    throw new AxisError("SIMULATION_FAILED", failure, { stage: "simulate" });
  }
}

/** Submit the signed group. All-or-nothing on chain. */
export async function settleDirect(group: ReturnType<any>): Promise<SettleResult> {
  try {
    const r = await group.send();
    return {
      groupId: r.groupId ?? "",
      txids: r.txIds,
      confirmedRound: Number(r.confirmations?.[0]?.confirmedRound ?? 0),
    };
  } catch (e) {
    throw new AxisError("SETTLEMENT_FAILED", (e as Error).message.split("\n")[0]);
  }
}
