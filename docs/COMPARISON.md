# MantleFlow Comparison

| Capability | MantleFlow | Raw agent payment | Basic invoice app | Centralized marketplace |
| --- | --- | --- | --- | --- |
| MNT escrow | Yes | No | Sometimes | Custodial |
| Agent mandate context | AP2-style hashes | Usually no | No | Platform-specific |
| Delivery evidence | Append-only roots | No | Metadata only | Platform records |
| Dispute evidence | Append-only roots | No | Limited | Platform-controlled |
| Split settlement | Counterparty-approved | No | Rare | Platform-controlled |
| Service bond | Yes | No | No | Platform policy |
| x402-style payment requirement | Yes | Yes | No | No |
| Scoped agent execution | EIP-712 permits | Usually broad/custodial | No | Custodial automation |
| Receipt-bound reputation | ERC-8004-style events/summaries | No | No | Private scoring |
| Validator attestation | Receipt-bound + TEE hash | No | No | Platform review |
| Live settlement intelligence | `/activity` analytics | No | Basic dashboard | Private admin data |

MantleFlow is strongest where a one-shot payment is insufficient: agentic services, delayed delivery, evidence-heavy work, refund risk, dispute negotiation, and reputation-bearing settlement.
