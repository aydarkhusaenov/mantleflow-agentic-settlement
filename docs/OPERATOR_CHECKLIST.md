# MantleFlow Operator Checklist

## Workspace

```bash
cd /home/legat/work/hackaton/Mantle-Turing-Test-Hackathon-2026
```

## Network

- Mantle Sepolia
- Chain ID: `5003`
- RPC: `https://rpc.sepolia.mantle.xyz`
- Explorer: `https://sepolia.mantlescan.xyz`
- Native token: `MNT`

Funded wallet:

```text
0x28C06E3fe7ED2D15fb8901Df9D48c895E18Ed590
```

Confirmed balance: `4 MNT`.

## Before Deployment

Current submission deployment:

```text
InvoiceEscrow: 0x7D0893625B9f8F0d5B84531393B84dE5624bAa78
Mantlescan: https://sepolia.mantlescan.xyz/address/0x7D0893625B9f8F0d5B84531393B84dE5624bAa78
```

Run these checks before any source-changing redeploy:

```bash
pnpm install
pnpm test
pnpm contracts:coverage
pnpm audit --prod
```

Also verify the Byreal skill files exist:

```bash
pnpm byreal:skill:catalog
```

## Deployment Commands

Use only for a deliberate redeploy:

```bash
pnpm contracts:deploy:mantle-sepolia
pnpm contracts:seed:mantle-sepolia
pnpm contracts:live-demo:mantle-sepolia
```

After the app is running against the deployed contract, capture Byreal skill proof for invoice `3`:

```bash
export MANTLEFLOW_ENDPOINT="http://localhost:3000"
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs settlement_context 3 0x28C06E3fe7ED2D15fb8901Df9D48c895E18Ed590
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs autonomous_next_action 3 0x28C06E3fe7ED2D15fb8901Df9D48c895E18Ed590
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs receipt_proof 3
```

## DoraHacks Submission Needs

- BUIDL name: `MantleFlow Agentic Settlement`
- Track: `Agentic Economy`
- GitHub repo link
- Mantle Sepolia contract address: `0x7D0893625B9f8F0d5B84531393B84dE5624bAa78`
- Mantlescan link: https://sepolia.mantlescan.xyz/address/0x7D0893625B9f8F0d5B84531393B84dE5624bAa78
- Byreal skill manifest link: `/.well-known/byreal-skill.json`
- Demo video
- X thread with pitch, demo, GitHub, contract, `@Mantle_Official`, and `#MantleAIHackathon`
