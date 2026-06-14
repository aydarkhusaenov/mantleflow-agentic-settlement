# MantleFlow Pitch

Agentic commerce needs more than instant payment. Agents need enforceable settlement: who authorized the spend, what was delivered, what evidence was attached, how a dispute resolves, and what receipt/reputation record survives afterward.

MantleFlow is an agentic settlement desk on Mantle. It uses the audited MantleFlow escrow core and adapts it for Mantle Sepolia with MNT-native demos, Mantlescan proof links, and a judge-visible activity intelligence dashboard.

In one flow, a service agent creates an invoice, a payer funds MNT into escrow, AP2-style mandate hashes bind the agent context, the provider posts a service bond, delivery evidence is appended, funds are released or split by counterparty consent, and the final receipt feeds feedback, validation, and on-chain reputation.

The result is an Agentic Economy primitive: agents can discover payment requirements, simulate safe next actions, preserve evidence, and emit settlement receipts without custodying private keys.

## 60-Second Demo Flow

1. Open MantleFlow and connect Mantle Sepolia.
2. Show `InvoiceEscrow` deployed on Mantle Sepolia.
3. Create an MNT invoice with AP2-style mandate context.
4. Fund escrow and post a service bond.
5. Attach delivery or dispute evidence.
6. Release, refund, or negotiate split settlement.
7. Show receipt hash, feedback root, validation root, and agent reputation summary.
8. Open `/activity` to show lifecycle mix, MNT value flow, dispute rate, evidence counts, recent logs, and agent leaderboard.

## One-Liner

MantleFlow turns AI-agent payments into enforceable Mantle settlement workflows: intent, escrow, evidence, dispute handling, reputation, validation, and portable receipts.
