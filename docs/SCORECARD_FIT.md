# Mantle Turing Test Scorecard Fit

This file maps MantleFlow to the DoraHacks/Mantle scorecard before final deployment.

## General Scorecard

The hackathon general scorecard weights:

- Technical depth: 30%
- Innovation: 25%
- Mantle ecosystem contribution: 25%
- Product completeness: 20%

MantleFlow answers those with:

- audited-style Solidity escrow state machine with 74 tests and 100% coverage for `InvoiceEscrow.sol`;
- Mantle Sepolia native MNT escrow, Mantlescan-ready deployment scripts, seed scripts, and live demo scripts;
- x402-style payment requirements, AP2-style mandate hashes, scoped action permits, service bonds, evidence roots, split settlement, receipt-bound feedback, and validator attestations;
- Next.js app, activity intelligence dashboard, MCP endpoint, Byreal skill adapter, and reproducible docs.

## Agentic Economy Track

Track-specific scoring emphasizes:

- Byreal integration depth;
- agent autonomy;
- use-case clarity and validity;
- verifiability and demo quality.

MantleFlow now targets those directly:

| Criterion | MantleFlow answer |
| --- | --- |
| Byreal integration depth | `/.well-known/byreal-skill.json`, `/api/byreal/skill`, and `skills/mantleflow-settlement/` expose settlement as an Agent Skills compatible adapter. |
| Agent autonomy | `autonomous_next_action` reads live contract state, wallet role, mandate/SLA context, evidence, and settlement proposals, then selects a safe next action. |
| Use-case clarity | Real agent-service settlement: an agent hires another agent or human provider, locks MNT escrow, tracks SLA evidence, and settles or disputes with receipts. |
| Verifiability | Every important output is backed by Mantle txs, payment requirement hash, receipt hash, evidence roots, feedback roots, and validator attestation roots. |

## What Still Must Be Done After Approval

- Deploy to Mantle Sepolia.
- Seed demo invoices.
- Run live demo transactions.
- Fill `docs/ONCHAIN.md` with Mantlescan links.
- Generate the Mantle-specific demo video from real deployed state.

## Sources Used

- DoraHacks Mantle Turing Test page: https://dorahacks.io/hackathon/mantleturingtesthackathon2026/detail
- DoraHacks Track 06 clarification: https://dorahacks.io/discussion/1561974
- Byreal Agent Skills repository: https://github.com/byreal-git/byreal-agent-skills
