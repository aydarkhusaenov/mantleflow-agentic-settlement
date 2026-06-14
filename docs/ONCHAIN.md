# MantleFlow On-Chain Proof

## Deployment

- Network: Mantle Sepolia
- Chain ID: `5003`
- Contract: `InvoiceEscrow`
- Address: `0x7D0893625B9f8F0d5B84531393B84dE5624bAa78`
- Explorer: https://sepolia.mantlescan.xyz/address/0x7D0893625B9f8F0d5B84531393B84dE5624bAa78
- Deployment tx: https://sepolia.mantlescan.xyz/tx/0xd75d098c90424181fb022e6cab0acd2c39307d0c9a2d76c14c25fbd9b42982ae
- Deployment block: `39961167`
- Deployer: `0x28C06E3fe7ED2D15fb8901Df9D48c895E18Ed590`

Deployment artifact:

```text
contracts/deployments/mantleSepolia.json
```

## Seeded Demo State

The contract has `4` invoices on Mantle Sepolia after seed/demo execution. The final live-demo invoice is `3`.

Live state for invoice `3`:

- Settlement receipt hash: `0x511ea4119f75dbfa14e3ca57123343df5027e83ec655e72e0c8971017b233e23`
- Feedback context: count `1`, root `0xe87417242b40f9d81a7a3f7c573725c8cfe97ffb25f410d7d494e5890d544a9d`
- Validation context: count `1`, root `0x5a8675772af4ddcaff0452c1b5b26a9456c828d9fc70da41d96d1e01e5f07f13`

The seed/live-demo flow exercised:

- Created invoices
- AP2-style agent mandate hashes
- MNT service bond
- MNT escrow payment
- Delivery evidence root
- Release path
- Receipt-bound feedback
- Receipt-bound validator attestation with TEE attestation hash

## Live Demo Transactions

Invoice `3` end-to-end proof:

| Step | Tx | Block |
| --- | --- | --- |
| Create invoice | https://sepolia.mantlescan.xyz/tx/0x5d3e3e2b22de3d14005d83d965195a5ef6e9d11138dc44b33d5480d20da3f589 | `39961448` |
| Attach AP2 agent mandate | https://sepolia.mantlescan.xyz/tx/0x60c7374d0d9274ddaceba87cd7f09703565749e5b151ffb09492155b5e349440 | `39961450` |
| Post service bond | https://sepolia.mantlescan.xyz/tx/0x4b640b6eecec0b3cef9f1d1f9624ec6297b538afdd74131b92c889c2d7b654bb | `39961452` |
| Pay invoice | https://sepolia.mantlescan.xyz/tx/0x4365663eae5ade3fba7ac27e082b4bb37231754a47a75943a5e63a217f3f2ea5 | `39961455` |
| Mark delivered | https://sepolia.mantlescan.xyz/tx/0x4273b70309545f7f2b1fb87b4161544580df3274c10e828445b3733635e81e62 | `39961457` |
| Release funds | https://sepolia.mantlescan.xyz/tx/0x14696584ec0cc404df06970e22ad253935da3409effd48f1f04c96224c58d4af | `39961460` |
| Submit feedback | https://sepolia.mantlescan.xyz/tx/0xfcb26e3926715dfcc963150eb84c2b2d3ed5242c8f7d43ce05f1ccbf789040f2 | `39961462` |
| Submit validator attestation | https://sepolia.mantlescan.xyz/tx/0xda801d662dd76dc937ccfc44171c38ae98545fe26a30ea8dc1a5a619591ee39c | `39961675` |

## Agent Hashes

- Payer agent hash: `0xb5fc3dba83328c9c5eeaa5598d7c58397656ee56b0f324696b8db8be6e3b3a78`
- Recipient/service agent hash: `0xb3ab41c56761bc1c7231282ebc5a819d937d7182987cddd440732c00de50166c`
- Validator agent hash: `0x8ebf7d631c2055cc7939b33a019bd647e6f258c3ef0483b78ca46e82bd494457`

## Byreal Skill Proof

Local/offline catalog proof:

```bash
pnpm byreal:skill:catalog
```

Runtime proof with the app running:

```bash
export MANTLEFLOW_ENDPOINT="http://localhost:3000"
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs settlement_context 3 0x28C06E3fe7ED2D15fb8901Df9D48c895E18Ed590
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs autonomous_next_action 3 0x28C06E3fe7ED2D15fb8901Df9D48c895E18Ed590
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs receipt_proof 3
```

## Verification Notes

- The contract is deployed and confirmed on Mantle Sepolia.
- The source is not claimed as explorer-verified unless Mantlescan verification is completed with an API key.
- The app and skill are non-custodial: they prepare unsigned calls and proof data; wallet or agent-account signing remains separate.
