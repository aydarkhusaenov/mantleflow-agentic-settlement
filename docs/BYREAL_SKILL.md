# Byreal Agent Skill Adapter

MantleFlow includes a Byreal Agent Skills compatible settlement adapter for the Agentic Economy track.

## Why This Exists

The track-specific scorecard rewards deep Byreal integration, agent autonomy, realistic use case, and verifiable demo quality. MantleFlow addresses that by exposing settlement as a reusable agent skill instead of only as a web UI.

## Skill Surface

- Skill manifest: `/.well-known/byreal-skill.json`
- Runtime endpoint: `/api/byreal/skill`
- Local skill folder: `skills/mantleflow-settlement/`
- CLI shim: `skills/mantleflow-settlement/bin/mantleflow-skill.mjs`

## Tools

`catalog`

Returns the available tools and public manifest location.

`settlement_context`

Reads live MantleFlow invoice state and returns payer, recipient, token, amount, state, payment requirement hash, receipt hash, and deterministic agent assessment.

`autonomous_next_action`

Selects the highest-priority safe action from the current wallet role and invoice state. The endpoint returns an unsigned transaction only when the action is enabled.

`build_unsigned_call`

Builds one bounded transaction call for:

- `pay`
- `release`
- `requestRefund`
- `refund`
- `cancel`
- `acceptSettlement`

`receipt_proof`

Returns receipt hash, AP2-style mandate hashes, payment requirement hash, delivery/dispute evidence roots, and final state.

## Safety Model

- No private keys are accepted.
- No transaction is broadcast by the adapter.
- Every plan includes the reason why an action is enabled or disabled.
- Final execution must be signed by a wallet, Byreal-compatible agent account, or other user-controlled signer.
- This is deliberate: the agent can perceive, decide, and prepare execution, while custody stays outside the skill.

## Local Use

Run the app locally:

```bash
pnpm dev
```

Point the skill at the app:

```bash
export MANTLEFLOW_ENDPOINT="http://localhost:3000"
```

Read catalog:

```bash
pnpm byreal:skill:catalog
```

Plan the next action for invoice `1`:

```bash
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs autonomous_next_action 1 0xYourWallet
```

After deployment, use the hosted frontend URL in `MANTLEFLOW_ENDPOINT` and repeat the same commands against live Mantle Sepolia state.

## Demo Proof

For judges, show the following sequence:

1. `GET /.well-known/byreal-skill.json`
2. `POST /api/byreal/skill` with `settlement_context`
3. `POST /api/byreal/skill` with `autonomous_next_action`
4. Sign the returned `unsignedCall` from the wallet or agent account
5. Show Mantlescan transaction hash
6. `POST /api/byreal/skill` with `receipt_proof`

This demonstrates a full agentic settlement loop: observe, reason, prepare action, execute with signer consent, and verify on-chain outcome.
