# DoraHacks BUIDL Submission - MantleFlow

## Project Name

MantleFlow Agentic Settlement

## Short Intro

Agentic invoice escrow on Mantle with MNT settlement, x402-style payments, AP2-style mandate proofs, ERC-8004-style reputation, TEE validation hashes, service bonds, dispute evidence, and live settlement intelligence.

## Track

Primary: Agentic Economy

Secondary narrative: AI DevTools / on-chain settlement intelligence

## Description

MantleFlow is an agentic settlement desk for Mantle. It turns AI-agent payments into enforceable commercial workflows: a seller creates an invoice, a payer or agent funds it with MNT, both sides can attach delivery or dispute evidence, the provider can post a service bond, counterparties can negotiate split settlement, and final outcomes produce portable receipt hashes.

The agent layer does not custody keys or invent authority. It reads live contract state and exposes safe next actions through the UI, MCP-style tools, x402-style payment requirements, receipt APIs, explain/simulate endpoints, and a live activity analytics dashboard.

The novelty is the settlement layer around agentic payment: AP2-style mandate hashes before funding, x402/EIP-3009-compatible payment requirements, scoped EIP-712 action permits, ERC-1271 wallet support, receipt-bound ERC-8004-style feedback and validator attestations, TEE attestation hashes, service-bond accountability, and contract-maintained agent reputation summaries.

## What Was Built During The Hackathon

Mantle-native project workspace, Mantle Sepolia network support, MNT-native frontend labels, deployment/seed/live-demo scripts for Mantle Sepolia, Mantle-oriented docs, DoraHacks BUIDL fields, and the agentic settlement product package based on the audited MantleFlow escrow core.

## Sponsor / Partner Technology

- Mantle Sepolia
- OpenZeppelin
- Hardhat
- Next.js
- React
- Viem / Wagmi

## Repository

To be filled after the Mantle repo is pushed.

## Mantle Contract

To be filled after final checks and deployment.

## Demo Video

Use the MantleFlow video generated for this workspace, or update the existing MantleFlow video after Mantle deployment links are final.

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
2. It targets the Agentic Economy track: agents can read payment requirements, simulate safe actions, create receipts, and surface live settlement intelligence without custodying keys.
3. On-chain proof: deployed `InvoiceEscrow` on Mantle Sepolia, seeded demo invoices, live `/activity` analytics, service-bond proof, and receipt-bound validation proof.
4. GitHub: fill with the public `mantleflow-agentic-settlement` repository URL.
5. Contract: fill with the Mantle Sepolia `InvoiceEscrow` address after final deployment.
6. Demo video: fill with the MantleFlow walkthrough video after deployment links are final.

## Final Honesty Rules

Do not submit until the Mantle contract address is real and the explorer link loads.
Do not claim source verification unless Mantlescan shows verified source.
Do not claim a hosted frontend unless a public URL exists.
