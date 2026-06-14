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

```bash
pnpm install
pnpm test
pnpm contracts:coverage
pnpm audit --prod
```

Do not deploy until these pass and the final submission docs are checked.

Also verify the Byreal skill files exist:

```bash
pnpm byreal:skill:catalog
```

## Deployment Commands

Run only after final approval:

```bash
pnpm contracts:deploy:mantle-sepolia
pnpm contracts:seed:mantle-sepolia
pnpm contracts:live-demo:mantle-sepolia
```

After the app is running against the deployed contract, capture Byreal skill proof:

```bash
export MANTLEFLOW_ENDPOINT="http://localhost:3000"
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs settlement_context 1 0x28C06E3fe7ED2D15fb8901Df9D48c895E18Ed590
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs autonomous_next_action 1 0x28C06E3fe7ED2D15fb8901Df9D48c895E18Ed590
node skills/mantleflow-settlement/bin/mantleflow-skill.mjs receipt_proof 1
```

## DoraHacks Submission Needs

- BUIDL name: `MantleFlow Agentic Settlement`
- Track: `Agentic Economy`
- GitHub repo link
- Mantle Sepolia contract address
- Mantlescan link
- Byreal skill manifest link: `/.well-known/byreal-skill.json`
- Demo video
- X thread with pitch, demo, GitHub, contract, `@Mantle_Official`, and `#MantleAIHackathon`
