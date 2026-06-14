# DoraHacks BUIDL Submission - MantleFlow

## Project Name

MantleFlow Agentic Settlement

## Short Intro

Agentic invoice escrow on Mantle with a Byreal Agent Skills compatible adapter, MNT settlement, x402-style payments, AP2-style mandate proofs, service bonds, dispute evidence, validation attestations, and live settlement intelligence.

## Track

Primary: Agentic Economy

Secondary narrative: AI DevTools / on-chain settlement intelligence

## Description

MantleFlow is an agentic settlement desk for Mantle. It turns AI-agent payments into enforceable commercial workflows: a seller creates an invoice, a payer or agent funds it with MNT, both sides can attach delivery or dispute evidence, the provider can post a service bond, counterparties can negotiate split settlement, and final outcomes produce portable receipt hashes.

The agent layer does not custody keys or invent authority. It reads live contract state and exposes safe next actions through the UI, MCP-style tools, x402-style payment requirements, receipt APIs, explain/simulate endpoints, a live activity analytics dashboard, and a Byreal Agent Skills compatible adapter.

The novelty is the settlement layer around agentic payment: AP2-style mandate hashes before funding, x402/EIP-3009-compatible payment requirements, scoped EIP-712 action permits, ERC-1271 wallet support, receipt-bound ERC-8004-style feedback and validator attestations, TEE attestation hashes, service-bond accountability, contract-maintained agent reputation summaries, and a skill endpoint that lets agents perceive, decide, prepare unsigned execution, and verify receipts.

## What Was Built During The Hackathon

Mantle-native project workspace, Mantle Sepolia network support, MNT-native frontend labels, deployment/seed/live-demo scripts for Mantle Sepolia, Byreal Agent Skills compatible adapter, Mantle-oriented docs, DoraHacks BUIDL fields, and the agentic settlement product package based on the audited MantleFlow escrow core.

## Sponsor / Partner Technology

- Mantle Sepolia
- Byreal Agent Skills compatible adapter
- OpenZeppelin
- Hardhat
- Next.js
- React
- Viem / Wagmi

## Repository

https://github.com/aydarkhusaenov/mantleflow-agentic-settlement

## Mantle Contract

`InvoiceEscrow`

```text
0x7D0893625B9f8F0d5B84531393B84dE5624bAa78
```

Mantlescan:

```text
https://sepolia.mantlescan.xyz/address/0x7D0893625B9f8F0d5B84531393B84dE5624bAa78
```

Deployment tx:

```text
https://sepolia.mantlescan.xyz/tx/0xd75d098c90424181fb022e6cab0acd2c39307d0c9a2d76c14c25fbd9b42982ae
```

Live demo invoice `3`:

```text
https://sepolia.mantlescan.xyz/tx/0x5d3e3e2b22de3d14005d83d965195a5ef6e9d11138dc44b33d5480d20da3f589
https://sepolia.mantlescan.xyz/tx/0x60c7374d0d9274ddaceba87cd7f09703565749e5b151ffb09492155b5e349440
https://sepolia.mantlescan.xyz/tx/0x4b640b6eecec0b3cef9f1d1f9624ec6297b538afdd74131b92c889c2d7b654bb
https://sepolia.mantlescan.xyz/tx/0x4365663eae5ade3fba7ac27e082b4bb37231754a47a75943a5e63a217f3f2ea5
https://sepolia.mantlescan.xyz/tx/0x4273b70309545f7f2b1fb87b4161544580df3274c10e828445b3733635e81e62
https://sepolia.mantlescan.xyz/tx/0x14696584ec0cc404df06970e22ad253935da3409effd48f1f04c96224c58d4af
https://sepolia.mantlescan.xyz/tx/0xfcb26e3926715dfcc963150eb84c2b2d3ed5242c8f7d43ce05f1ccbf789040f2
https://sepolia.mantlescan.xyz/tx/0xda801d662dd76dc937ccfc44171c38ae98545fe26a30ea8dc1a5a619591ee39c
```

## Demo Video

Record the demo from the deployed Mantle Sepolia state and live `/activity` view. Use [docs/demo-script.md](demo-script.md) and [docs/ONCHAIN.md](ONCHAIN.md).

## X Thread Checklist

The official Mantle guidance requests an X thread with:

- Short project pitch
- Short demo video
- GitHub repository link
- Mantle-deployed smart contract address
- Tag `@Mantle_Official`
- Hashtag `#MantleAIHackathon`

Draft thread:

1. MantleFlow is agentic settlement infrastructure for Mantle: invoices, MNT escrow, AP2-style mandates, evidence, service bonds, disputes, settlement receipts, and agent reputation.
2. It targets the Agentic Economy track: a Byreal Agent Skills compatible adapter lets agents read settlement context, choose a safe next action, build unsigned calldata, and prove receipt outcomes without custodying keys.
3. On-chain proof: deployed `InvoiceEscrow` on Mantle Sepolia, seeded demo invoices, live `/activity` analytics, service-bond proof, skill-planned transaction, feedback root, and receipt-bound validation proof.
4. GitHub: https://github.com/aydarkhusaenov/mantleflow-agentic-settlement
5. Contract: `0x7D0893625B9f8F0d5B84531393B84dE5624bAa78` on Mantle Sepolia: https://sepolia.mantlescan.xyz/address/0x7D0893625B9f8F0d5B84531393B84dE5624bAa78
6. Demo video: attach the MantleFlow walkthrough video recorded from the deployed state.

## Final Honesty Rules

Do not submit until the Mantle contract address is real and the explorer link loads.
Do not claim source verification unless Mantlescan shows verified source.
Do not claim a hosted frontend unless a public URL exists.
