# MantleFlow Agentic Settlement

Agentic invoice escrow, delivery evidence, reputation, and settlement intelligence for Mantle Sepolia.

MantleFlow is a Mantle-native settlement system for The Turing Test Hackathon 2026. It turns agent-triggered payments into enforceable commercial workflows: invoice creation, MNT escrow funding, AP2-style mandate hashes, service bonds, delivery evidence, dispute evidence, timeout paths, counterparty-approved split settlement, receipt-bound feedback, validator attestations, and live settlement analytics.

## Hackathon Fit

- Event: The Turing Test Hackathon 2026, Phase II
- Primary track: Agentic Economy
- Secondary fit: AI DevTools / on-chain settlement intelligence
- Chain target: Mantle Sepolia
- Native gas/payment demo asset: MNT
- Core contract: `InvoiceEscrow`
- Frontend identity: MantleFlow

Official Mantle guidance for this phase asks builders to submit an X thread containing a pitch, short demo video, GitHub link, and Mantle-deployed smart-contract address. This repo is prepared around that package.

## What Makes It Strong

- Mantle Sepolia deployment target with MNT-native invoice and service-bond flows.
- Agentic settlement, not just payment: escrow, evidence, refund windows, compromise settlement, and receipt generation.
- Byreal Agent Skills compatible adapter for settlement context, autonomous next-action planning, unsigned transaction generation, and receipt proof.
- x402-style payment requirements plus EIP-3009 funding path for compatible ERC20s.
- AP2-style intent, cart, payment, and prompt-playback mandate hashes.
- EIP-712 signed payer mandates and scoped action permits with nonce cancellation.
- ERC-1271 contract-wallet signature support.
- ERC-8004-style feedback, validation, and reputation events/summaries.
- Receipt-bound validator attestations with TEE attestation hash support.
- Live `/activity` analytics for lifecycle mix, native-value flow, dispute rate, evidence counts, and agent reputation leaderboard.
- Security-hardening already proven by 74 contract tests, 100% production contract coverage, production dependency audit, and Slither scan with 0 deployable-code findings.

## Byreal Agent Skill

MantleFlow exposes an Agentic Economy track adapter:

- manifest: `/.well-known/byreal-skill.json`
- endpoint: `/api/byreal/skill`
- local skill: `skills/mantleflow-settlement/`
- docs: [docs/BYREAL_SKILL.md](docs/BYREAL_SKILL.md)

The skill is intentionally non-custodial. It perceives live invoice context, selects a safe next action, and returns unsigned calldata. Final signing stays with the wallet or agent-account layer.

## Quick Start

```bash
pnpm install
pnpm test
```

## Mantle Sepolia Environment

Create `.env` from `.env.example` and set the funded testnet key:

```text
MANTLE_SEPOLIA_RPC_URL=https://rpc.sepolia.mantle.xyz
PRIVATE_KEY=0xTESTNET_ONLY_PRIVATE_KEY
NEXT_PUBLIC_CHAIN_ID=5003
NEXT_PUBLIC_ESCROW_ADDRESS=
```

The funded deployment wallet is:

```text
0x28C06E3fe7ED2D15fb8901Df9D48c895E18Ed590
```

Explorer:

```text
https://sepolia.mantlescan.xyz/address/0x28C06E3fe7ED2D15fb8901Df9D48c895E18Ed590
```

## Deploy Only After Final Checks

Deployment is intentionally the last step.

```bash
pnpm contracts:deploy:mantle-sepolia
pnpm contracts:seed:mantle-sepolia
pnpm contracts:live-demo:mantle-sepolia
```

After deployment, set:

```text
NEXT_PUBLIC_ESCROW_ADDRESS=0xDEPLOYED_MANTLE_CONTRACT
```

Then run:

```bash
pnpm dev
```

Open:

```text
http://localhost:3000/activity
```

## Submission Docs

- DoraHacks fields: [docs/DORAHACKS_BUIDL.md](docs/DORAHACKS_BUIDL.md)
- Deployment guide: [docs/deployment.md](docs/deployment.md)
- On-chain proof: [docs/ONCHAIN.md](docs/ONCHAIN.md)
- Byreal skill adapter: [docs/BYREAL_SKILL.md](docs/BYREAL_SKILL.md)
- Scorecard fit: [docs/SCORECARD_FIT.md](docs/SCORECARD_FIT.md)
- Security notes: [docs/security.md](docs/security.md)
- Architecture: [docs/architecture.md](docs/architecture.md)
