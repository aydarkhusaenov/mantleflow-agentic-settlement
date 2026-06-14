# Judge Demo Script

Use this script for screenshots, judging review, or a live walkthrough.

## Glass-Box On-Chain Demo

The deployed Mantle Sepolia demo is invoice `3`:

```text
0x7D0893625B9f8F0d5B84531393B84dE5624bAa78
```

Proof links are in [ONCHAIN.md](ONCHAIN.md).

For a deliberate fresh demo run, use:

```bash
pnpm contracts:live-demo:mantle-sepolia
```

The flow creates one invoice and runs a deterministic agentic settlement loop:

1. create invoice
2. attach signed payment mandate
3. post service bond
4. pay invoice in MNT
5. mark delivered
6. release funds
7. submit receipt-bound feedback
8. submit receipt-bound validator attestation

It prints every transaction hash and Mantlescan URL for inclusion in [ONCHAIN.md](ONCHAIN.md).

## Byreal Skill Demo

With the app running against the deployed contract, show the Agentic Economy adapter:

```bash
export MANTLEFLOW_ENDPOINT="http://localhost:3000"
pnpm byreal:skill:catalog
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs settlement_context 1 0x28C06E3fe7ED2D15fb8901Df9D48c895E18Ed590
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs autonomous_next_action 1 0x28C06E3fe7ED2D15fb8901Df9D48c895E18Ed590
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs receipt_proof 1
```

Narrate the result as: the skill perceives live Mantle state, chooses a safe next action, returns unsigned calldata, and proves the outcome through receipt and evidence hashes. It does not custody keys or broadcast transactions.

## Flow 1: Clean Settlement

1. Create an MNT invoice with a recipient, metadata hash, due date, and timeout.
2. Show the generated payment requirement hash.
3. Connect the payer wallet, enter it as authorized payer, and attach a signed mandate with payer agent hash, service agent hash, policy hash, SLA deadline, and mandate expiry.
4. Recipient posts a small service bond.
5. Fund the invoice from the authorized payer wallet.
6. Show the agent panel reading the live `Paid` state, authorized payer, payment requirement hash, mandate hash, SLA, delivery/dispute evidence counts, bond, and receipt hash.
7. Sign a scoped action permit for `Release funds` with the connected wallet as executor.
8. Execute the signed permit and show that the release uses the signer permission, not a broad approval.
9. Show the invoice closing as `Released`, bond returned to provider, and the finalized settlement receipt.
10. Submit a validator attestation for the service agent and show the validation root update.

## Flow 2: Evidence And Dispute

1. Create a second MNT invoice.
2. Attach an agent mandate and SLA context before payment.
3. Recipient posts a service bond.
4. Connect a payer wallet and fund the invoice.
5. Recipient attaches `ipfs://mantleflow-delivery-proof`.
6. Payer requests a refund.
7. Payer attaches dispute evidence.
8. Agent shows refund window, delivery evidence, dispute evidence, timeout, mandate context, bond status, and settlement options.
9. Recipient signs a scoped action permit for `Propose split`, with exact payout amount and memo hash.
10. Execute the permit and show the open partial split, for example `80%` recipient and `20%` payer refund.
11. Show that proposer can cancel stale split offers, then create the final split offer.
12. Payer accepts the settlement.
13. Show final state `Settled`, bond returned, and the receipt hash that can feed reputation later.
14. Submit counterparty feedback and show the feedback root update.
15. Submit a validator attestation against the finalized receipt and show the validation root update.

## Flow 3: Timeout Protection

1. Create an invoice with a short timeout on a local chain.
2. Attach an SLA mandate before payment and have recipient post a small bond.
3. Payer funds the invoice and later requests refund.
4. Before timeout, show that payer refund is blocked.
5. After timeout, show that payer can refund.
6. If no timely delivery evidence exists and the SLA is missed, show provider bond slashed to payer.

## What To Emphasize

- MantleFlow is an agentic economy primitive: agents can quote, fund, deliver, dispute, settle, and build reputation around one enforceable invoice.
- The agent is not generic help text; it reads contract state, wallet role, timing windows, delivery evidence, and settlement proposals.
- It also reads authorized payer, payment requirement hash, mandate hash, policy hash, SLA deadline, and portable receipt hash.
- It reads delivery and dispute evidence chain counts so both sides have an auditable trail.
- It can sign and execute scoped action permits for one exact invoice action with expiry, nonce, executor, and parameter hash.
- After final settlement, it lets counterparties submit receipt-bound feedback for agent reputation.
- After final settlement, it lets independent validators submit receipt-bound attestations for validation registries.
- It reads service bond status and explains whether the bond is active, returned, or slashed.
- There is no admin withdrawal or trusted arbitrator.
- Every fund movement is either direct release, timeout path, refund approval, or counterparty-accepted settlement.
- Mantle makes repeated small settlement actions practical for autonomous service agents, human operators, and on-chain service providers.
