# MantleFlow Deployment

## Target

- Primary chain: Mantle Sepolia
- Chain ID: `5003`
- Native gas token: `MNT`
- RPC: `https://rpc.sepolia.mantle.xyz`
- Explorer: `https://sepolia.mantlescan.xyz`
- Contract: `InvoiceEscrow`

## Current Status

Not deployed yet. Deployment is intentionally paused until code, docs, tests, and final submission materials are checked.

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
NEXT_PUBLIC_ESCROW_ADDRESS=
```

Optional source verification:

```text
MANTLESCAN_API_KEY=OPTIONAL_KEY
```

## Verification Gate Before Deployment

Run from repo root:

```bash
pnpm install
pnpm test
pnpm contracts:coverage
pnpm audit --prod
```

Deployment should happen only after these pass.

## Deployment Commands

Run only after final approval:

```bash
pnpm contracts:deploy:mantle-sepolia
pnpm contracts:seed:mantle-sepolia
pnpm contracts:live-demo:mantle-sepolia
```

After deploy, set:

```text
NEXT_PUBLIC_ESCROW_ADDRESS=0xDEPLOYED_MANTLE_CONTRACT
```

Optional verification:

```bash
pnpm --filter @mantleflow/contracts verify:mantle-sepolia 0xDEPLOYED_MANTLE_CONTRACT
```

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
- Mantle Sepolia contract address
- Mantlescan contract link
- Demo video link or upload
- X thread link if DoraHacks asks for it
