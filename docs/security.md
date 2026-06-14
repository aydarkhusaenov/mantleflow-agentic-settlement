# Security Notes

## Contract Controls

- No owner/admin withdrawal function.
- Funds only move through explicit invoice state transitions.
- All state-mutating entry points are protected by `nonReentrant`.
- Final state, bond resolution, receipt hash, and events are prepared before outbound transfers.
- ETH outbound transfers use a try-push, credit-on-failure fallback so a recipient that rejects ETH cannot block another party's principal/refund/settlement.
- Pending ETH credits are tracked in `withdrawable(account, token)` and can be pulled with `withdraw(token)`.
- ERC20 transfers use OpenZeppelin `SafeERC20`.
- ERC20 payments and service bonds use exact balance-delta checks, so fee-on-transfer tokens are rejected instead of underfunding escrow.
- Invalid calls use custom errors.
- Partial settlements require a proposal from one counterparty and acceptance by the other.
- Agent mandates are immutable after first attachment and must be attached before payment.
- SLA deadlines must be future timestamps when attached; `0` means no SLA.
- Agent mandates are stored as hashes/references, not raw sensitive prompts or private user instructions.
- Signed mandates use EIP-712 typed data bound to the invoice payment requirement hash.
- The EIP-712 domain is discoverable through EIP-5267 `eip712Domain()`.
- Signed mandates can lock funding to an authorized payer and expire before payment.
- Signature verification accepts EOA signatures and ERC-1271 contract-wallet validation.
- Action permits use EIP-712 typed data bound to invoice id, action enum, signer, executor, exact parameter hash, validity window, expiry, and nonce.
- Action permit execution reuses the normal escrow state machine with authorization checked against the signer, not the relayer.
- Action permit nonces are tracked per signer to block replay across invoices and executors.
- Action permit signers can cancel unused nonces before execution.
- Action permits can be bound to one executor or intentionally left open with `address(0)`.
- Payment requirement hashes bind invoice amount, token, recipient, due date, timeout, metadata, chain, and escrow contract.
- EIP-3009 escrow funding binds the authorization nonce to `paymentRequirementHash(invoiceId)`, uses `receiveWithAuthorization`, and rejects underfunded or fee-like transfers through an exact balance-delta check before marking an invoice paid.
- Finalized receipt hashes are deterministic summaries and do not custody or redirect funds.
- Delivery evidence stores both a reference hash and the timestamp when it was attached.
- Delivery evidence and payer dispute evidence append into separate rolling roots.
- First delivery timestamp is preserved for SLA checks; later delivery entries cannot erase timely evidence.
- Settlement proposers can cancel their own open proposals before counterparty acceptance.
- Post-settlement feedback is bound to the finalized receipt hash and accumulated in a rolling root.
- Post-settlement validator attestations are bound to the finalized receipt hash and accumulated in a separate rolling root.
- Validator attestations require an EIP-712 validator signature, validator agent hash, attached subject agent hash, expiry, and per-validator nonce.
- Validators can cancel unused attestation nonces before submission.
- Service bonds are optional and resolved only through existing terminal states.

## Authorization

- Unpaid invoices can be cancelled by creator or recipient.
- Paid invoices can be released by payer immediately.
- Recipient can release only after timeout if payer is inactive and no refund was requested.
- Payer can request a refund while invoice is paid.
- Recipient can approve refund immediately after request.
- Payer can claim refund only after refund timeout.
- Recipient can attach delivery evidence while an invoice is paid or refund-requested.
- Payer can attach dispute evidence while an invoice is paid or refund-requested.
- Payer or recipient can propose a partial split settlement while an invoice is paid or refund-requested.
- Settlement proposer can cancel their own open split proposal.
- Only the non-proposing counterparty can accept a settlement proposal.
- After final settlement, payer can review the recipient agent and recipient can review the payer agent.
- After final settlement, any validator can submit a signed attestation for the attached payer or recipient agent.
- Validation attestation relayers cannot spoof validators; the validator address must sign the exact receipt, subject agent, schema, evidence, TEE attestation hash, verdict, score, expiry, and nonce.
- Creator or recipient can attach an agent mandate before payment; the payer accepts those rules by funding the invoice.
- Anyone can submit a signed mandate only if the authorized payer signed the exact EIP-712 mandate for that invoice requirement.
- If a signed mandate has an authorized payer, only that payer can fund the invoice.
- Anyone can execute an action permit only if they match the signed executor binding and the signer approved the exact action parameters.
- A permit relayer cannot gain extra rights; payer/recipient role checks still run against the permit signer.
- Recipient can post a service bond only while the invoice is Created or Paid.
- Recipient timeout release is blocked by an SLA unless delivery evidence was attached by the SLA deadline.
- Service bond is slashed only if refund occurs after SLA, no timely delivery evidence exists, and a payer is present.

## Test Coverage

Tests cover:

- invoice creation
- invalid invoice inputs
- unpaid cancellation authorization
- ETH exact payment
- wrong ETH amount rejection
- double payment rejection
- due-date payment rejection
- release path
- wrong caller and double release rejection
- recipient timeout release
- refund request
- recipient-approved refund
- refund-before-timeout rejection
- payer timeout refund
- ERC20 pay and release path
- ETH value rejection on ERC20 invoice
- delivery evidence authorization
- delivery evidence after refund request
- negotiated ETH split settlement
- proposer cannot accept their own settlement
- invalid settlement state, caller, and amount
- negotiated ERC20 split settlement
- agent mandate attachment and authorization
- mandate overwrite rejection
- stale SLA deadline rejection
- post-payment mandate rejection
- x402-style payment requirement hash generation
- x402/EIP-3009 escrow funding success and invalid-input rejection
- EIP-3009 past-due and underfunded authorization rejection
- EIP-5267 EIP-712 domain discovery
- EIP-712 signed mandate attachment
- wrong-signer signed mandate rejection
- authorized payer payment lock
- signed mandate expiry before payment
- EIP-712 action permit execution
- action permit replay rejection
- action permit executor binding
- action permit exact parameter binding
- action permit expiry and not-yet-active rejection
- action permit signer-role enforcement
- action permit nonce cancellation before execution
- portable settlement receipt event
- ETH service bond return on release
- ETH payout crediting when a recipient rejects automatic ETH receipt
- pull-withdraw of pending credited ETH
- strict withdraw failure when the credited account still rejects ETH
- ETH service bond slash on missed SLA
- payer timeout refund when a bonded recipient rejects automatic ETH receipt
- service bond rejection after refund request
- timely delivery evidence preventing service bond slash
- late delivery evidence still allowing service bond slash
- append-only delivery evidence root
- payer dispute evidence root
- empty evidence rejection
- SLA-gated recipient timeout release
- settlement proposal cancellation
- post-settlement feedback root
- feedback role authorization
- feedback score bounds
- receipt-bound validator attestation root
- cross-invoice agent reputation aggregate and summary updates
- validator attestation replay rejection
- validator attestation nonce cancellation before submission
- validator attestation expiry rejection
- validator attestation subject-agent validation
- validator attestation signature parameter binding
- ERC20 service bond return on split settlement
- fee-on-transfer ERC20 invoice rejection
- fee-on-transfer ERC20 service bond rejection
- protocol solvency across active escrows, active bonds, and credited payouts

## Automated Checks

- `pnpm test`: contract tests plus production frontend build.
- `pnpm audit --prod`: no known production vulnerabilities.
- `pnpm audit --audit-level high`: no known high-severity vulnerabilities.
- `slither contracts --filter-paths 'contracts/contracts/Mock|contracts/test|node_modules' --exclude-informational --exclude-low --exclude-medium`: 0 medium/high findings.
- The two ETH `.call` sites have narrow Slither suppressions after manual review: terminal flows finalize state before payout and enter through `nonReentrant`; `withdraw` zeroes the credit before the strict transfer and is also `nonReentrant`.
- `InvoiceEscrow.sol` has 100% measured statements/branches/functions/lines coverage with 74 passing Hardhat tests, including AP2 mandate hashes, TEE validation hashes, ERC-8004-style feedback/validation events, and the solvency-invariant scenario above.

## Residual Risks

- ERC20 frontend flow assumes prior token approval for custom ERC20 invoices.
- EIP-3009 funding is only available for ERC20s that implement `receiveWithAuthorization`; the dashboard labels USDC explicitly and keeps custom ERC20s as an advanced path.
- Metadata is stored as a string reference and is not validated on-chain.
- Settlement memos and delivery evidence are off-chain references; the contract enforces consent and payouts, not truthfulness of external files.
- Evidence roots prove the sequence of submitted references, not the factual truth of the underlying off-chain evidence.
- Feedback roots prove that a counterparty submitted feedback after final settlement; external reputation systems still decide how to weight or moderate that feedback.
- Validation roots prove that a validator signed an attestation about an attached agent, finalized receipt, evidence, and optional TEE attestation hash; external validation systems still decide validator trust and scoring semantics.
- Cross-invoice reputation is an on-chain aggregate of submitted feedback and validation scores. It is useful for agent automation, but it does not solve Sybil resistance or validator quality by itself.
- Agent mandate hashes are integrity anchors. External systems still need to store or verify the corresponding signed payload.
- The EIP-712 signed mandate binds a payer to the invoice requirement hash, but it does not prove off-chain metadata truthfulness.
- Action permits bound to `address(0)` can be executed by any relayer. This is intentional for open automation, but the frontend defaults to a concrete executor.
- The in-contract EOA verifier supports standard 65-byte secp256k1 signatures. Contract wallets can use ERC-1271 validation.
- Service bond slashing uses objective time/evidence conditions, not subjective quality evaluation.
- A smart-account recipient that rejects ETH can no longer block invoice finalization, but its own credited ETH remains pending until that account can successfully receive a withdrawal.
- No centralized arbitration layer is included by design; compromise settlement is counterparty-approved.
- Full dev-tooling audit still reports one low-severity `elliptic` advisory through Hardhat 2 / ethers v5 internals. The advisory currently has no patched version; it is not part of the production frontend dependency graph.
