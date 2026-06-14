# Why MantleFlow

## Problem

AI agents can request and trigger payments, but real commerce needs more than a transfer. Buyers need proof of what was authorized. Providers need payment assurance. Both sides need delivery evidence, refund paths, dispute settlement, and receipts that other systems can verify.

## Why Mantle

Mantle provides low-cost EVM execution for repeated settlement actions: create invoice, attach mandate, fund, attach evidence, post a bond, release, refund, propose a split, submit feedback, and validate. That makes agentic service commerce practical as an on-chain workflow rather than a centralized marketplace record.

## What MantleFlow Adds

MantleFlow adds the missing settlement layer around agentic payment:

- MNT escrow for invoices and service bonds.
- AP2-style intent, cart, payment, and prompt-playback mandate hashes.
- x402-style payment requirements.
- Scoped EIP-712 action permits for bounded agent execution.
- Delivery and dispute evidence roots.
- Counterparty-approved split settlement.
- Receipt-bound feedback and validator attestations.
- ERC-8004-style reputation summaries.
- TEE attestation hash support.
- `/activity` settlement intelligence for judges and agents.

MantleFlow does not pretend an LLM decides truth. The smart contract enforces authorization and fund movement. Agents read state, explain safe actions, and create machine-readable settlement records.
