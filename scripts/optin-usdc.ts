/**
 * Phase 0 · step 3 — opt every provider payee into the USDC ASA.
 *
 * On Algorand an account must opt in to an asset before it can receive it.
 * A transfer to a non-opted-in address fails, and because our payments live in an
 * atomic group, ONE un-opted payee kills the ENTIRE workflow. This is the single
 * most common cause of a mystifying group failure.
 *
 * Opt-in requires ~0.1 ALGO of minimum balance per asset, so the agent funds each
 * payee with a small ALGO float first.
 */
import { algorand, PROVIDERS, USDC_ASA_ID, requireEnv, explorerTx, hr } from "./_shared.ts";

const algo = algorand();
const agent = algo.account.fromMnemonic(requireEnv("AGENT_MNEMONIC"));
algo.setSignerFromAccount(agent);

/** enough for the 0.1 ALGO asset MBR + a few txn fees */
const FLOAT_MICROALGO = 300_000n;

hr(`Opting ${PROVIDERS.length} payees into USDC ASA ${USDC_ASA_ID}`);

for (const p of PROVIDERS) {
  const address = requireEnv(`PAY_TO_${p.key}`);
  const mnemonic = requireEnv(`PAY_TO_${p.key}_MNEMONIC`);
  const payee = algo.account.fromMnemonic(mnemonic);

  process.stdout.write(`${p.name.padEnd(18)}`);

  // Already opted in? Skip — this script is safe to re-run.
  try {
    const info = await algo.account.getInformation(address);
    if (info.assets?.some((a) => BigInt(a.assetId) === USDC_ASA_ID)) {
      console.log("already opted in — skipped");
      continue;
    }
  } catch {
    /* account not on chain yet; the float payment below creates it */
  }

  // Fund the float and opt in, in one atomic group.
  const result = await algo
    .newGroup()
    .addPayment({
      sender: agent.addr,
      receiver: address,
      amount: { microAlgo: FLOAT_MICROALGO } as never,
      signer: agent.signer,
    })
    .addAssetOptIn({
      sender: address,
      assetId: USDC_ASA_ID,
      signer: payee.signer,
    })
    .send();

  const txid = result.txIds[result.txIds.length - 1];
  console.log(`opted in  ${txid}`);
  console.log(`${" ".repeat(18)}${explorerTx(txid)}`);
}

hr();
console.log("✔ Opt-in pass complete. Verify with:  pnpm accounts:check\n");
