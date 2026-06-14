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

## Deployment Commands

Run only after final approval:

```bash
pnpm contracts:deploy:mantle-sepolia
pnpm contracts:seed:mantle-sepolia
pnpm contracts:live-demo:mantle-sepolia
```

## DoraHacks Submission Needs

- BUIDL name: `MantleFlow Agentic Settlement`
- Track: `Agentic Economy`
- GitHub repo link
- Mantle Sepolia contract address
- Mantlescan link
- Demo video
- X thread with pitch, demo, GitHub, contract, `@Mantle_Official`, and `#MantleAIHackathon`
