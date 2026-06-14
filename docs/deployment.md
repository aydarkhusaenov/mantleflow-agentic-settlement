# MantleFlow Deployment

## Target

- Primary chain: Mantle Sepolia
- Chain ID: `5003`
- Native gas token: `MNT`
- RPC: `https://rpc.sepolia.mantle.xyz`
- Explorer: `https://sepolia.mantlescan.xyz`
- Contract: `InvoiceEscrow`

## Current Status

Deployed on Mantle Sepolia.

```text
InvoiceEscrow: 0x7D0893625B9f8F0d5B84531393B84dE5624bAa78
Explorer: https://sepolia.mantlescan.xyz/address/0x7D0893625B9f8F0d5B84531393B84dE5624bAa78
Deployment tx: https://sepolia.mantlescan.xyz/tx/0xd75d098c90424181fb022e6cab0acd2c39307d0c9a2d76c14c25fbd9b42982ae
```

Funded deployer wallet:

```text
0x28C06E3fe7ED2D15fb8901Df9D48c895E18Ed590
```

Balance confirmed by user: `4 MNT` on Mantle Sepolia.

## Required Inputs

Local `.env` values:

```text
MANTLE_SEPOLIA_RPC_URL=https://rpc.sepolia.mantle.xyz
PRIVATE_KEY=0xTESTNET_ONLY_PRIVATE_KEY
NEXT_PUBLIC_CHAIN_ID=5003
NEXT_PUBLIC_ESCROW_ADDRESS=0x7D0893625B9f8F0d5B84531393B84dE5624bAa78
```

Optional source verification:

```text
MANTLESCAN_API_KEY=OPTIONAL_KEY
```

## Verification Gate

Run from repo root:

```bash
pnpm install
pnpm test
pnpm contracts:coverage
pnpm audit --prod
```

These checks are the reproducibility gate for source changes before any redeploy.

## Deployment Commands

Use only for a deliberate redeploy:

```bash
pnpm contracts:deploy:mantle-sepolia
pnpm contracts:seed:mantle-sepolia
pnpm contracts:live-demo:mantle-sepolia
```

Current frontend contract value:

```text
NEXT_PUBLIC_ESCROW_ADDRESS=0x7D0893625B9f8F0d5B84531393B84dE5624bAa78
```

Optional verification:

```bash
pnpm --filter @mantleflow/contracts verify:mantle-sepolia 0x7D0893625B9f8F0d5B84531393B84dE5624bAa78
```

Do not claim Mantlescan source verification until the explorer verification page shows verified source.

## Frontend

```bash
pnpm dev
```

Open:

```text
http://localhost:3000
http://localhost:3000/activity
```

## Final DoraHacks Fields To Update After Deployment

- GitHub repository URL
- Mantle Sepolia contract address: `0x7D0893625B9f8F0d5B84531393B84dE5624bAa78`
- Mantlescan contract link: https://sepolia.mantlescan.xyz/address/0x7D0893625B9f8F0d5B84531393B84dE5624bAa78
- Demo video link or upload
- X thread link if DoraHacks asks for it
