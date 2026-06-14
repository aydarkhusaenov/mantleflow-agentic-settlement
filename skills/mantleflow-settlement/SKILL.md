# MantleFlow Settlement Skill

Use this skill when a Byreal-compatible agent, RealClaw extension, or agentic wallet needs to reason about and execute MantleFlow settlement workflows.

## Purpose

MantleFlow turns agent work into verifiable Mantle transactions:

- read invoice state and payment requirements;
- assess safe next actions from wallet role, state, SLA, evidence, and settlement context;
- build unsigned calldata for one bounded action;
- return receipt, AP2-style mandate, evidence-root, feedback, and validator-attestation proof.

## Safety Rules

- Never ask for or store a private key.
- Never broadcast a transaction from this skill.
- Treat `autonomous_next_action` as a deterministic plan, not final authorization.
- Submit `unsignedCall` only through a wallet, Byreal-compatible agent account, or other signer controlled by the user.
- Refuse actions that are disabled in the returned assessment.

## Configuration

Set the public MantleFlow endpoint:

```bash
export MANTLEFLOW_ENDPOINT="https://your-mantleflow-app.example"
```

For local testing:

```bash
export MANTLEFLOW_ENDPOINT="http://localhost:3000"
```

## Tools

### catalog

Returns the skill catalog.

```bash
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs catalog
```

### settlement_context

Reads invoice state and deterministic agent assessment.

```bash
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs settlement_context 1 0xYourWallet
```

### autonomous_next_action

Selects the highest-priority safe action and returns unsigned calldata when available.

```bash
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs autonomous_next_action 1 0xYourWallet
```

### build_unsigned_call

Builds calldata for one exact invoice action.

```bash
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs build_unsigned_call 1 release
```

### receipt_proof

Returns the receipt hash, payment requirement hash, AP2-style mandate hashes, and evidence roots.

```bash
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs receipt_proof 1
```

## Judge Demo

Use `autonomous_next_action` during the demo to show that the agent can:

1. perceive live on-chain context;
2. decide whether payment, release, refund, or settlement is safe;
3. produce one bounded unsigned transaction;
4. leave final signing to the wallet or agent-account layer;
5. prove outcomes with Mantle transaction hashes and receipt hashes.
