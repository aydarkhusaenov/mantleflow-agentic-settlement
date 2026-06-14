import { createPublicClient, defineChain, http, isAddress, zeroAddress, zeroHash } from "viem";
import { invoiceEscrowAbi } from "@/lib/abi";
import type { AgentContextRecord, InvoiceRecord } from "@/lib/agent";

const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.sepolia.mantle.xyz"] }
  },
  blockExplorers: {
    default: { name: "Mantlescan Sepolia", url: "https://sepolia.mantlescan.xyz" }
  },
  testnet: true
});

const hardhat = defineChain({
  id: 31337,
  name: "Hardhat",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] }
  },
  testnet: true
});

export function getEscrowAddress() {
  const address = process.env.NEXT_PUBLIC_ESCROW_ADDRESS;
  if (!address || !isAddress(address)) {
    throw new Error("NEXT_PUBLIC_ESCROW_ADDRESS is not configured");
  }
  return address;
}

export function getServerChain() {
  if (process.env.NEXT_PUBLIC_CHAIN_ID === String(mantleSepolia.id)) return mantleSepolia;
  return process.env.NEXT_PUBLIC_CHAIN_ID === String(hardhat.id) ? hardhat : mantleSepolia;
}

export function chainSlug(chainId: number) {
  if (chainId === hardhat.id) return "hardhat";
  return chainId === mantleSepolia.id ? "mantle-sepolia" : "unknown";
}

export function getServerClient() {
  const chain = getServerChain();
  const rpcUrl =
    chain.id === hardhat.id
      ? process.env.HARDHAT_RPC_URL || "http://127.0.0.1:8545"
      : process.env.MANTLE_SEPOLIA_RPC_URL || "https://rpc.sepolia.mantle.xyz";

  return createPublicClient({
    chain,
    transport: http(rpcUrl)
  });
}

export async function readInvoiceBundle(invoiceId: bigint) {
  const address = getEscrowAddress();
  const client = getServerClient();
  const [invoiceRaw, paymentRequirementHash, agentContextRaw, bondContextRaw, receiptHash] = await Promise.all([
    client.readContract({
      address,
      abi: invoiceEscrowAbi,
      functionName: "getInvoice",
      args: [invoiceId]
    }),
    client.readContract({
      address,
      abi: invoiceEscrowAbi,
      functionName: "paymentRequirementHash",
      args: [invoiceId]
    }),
    client.readContract({
      address,
      abi: invoiceEscrowAbi,
      functionName: "getAgentContext",
      args: [invoiceId]
    }),
    client.readContract({
      address,
      abi: invoiceEscrowAbi,
      functionName: "getBondContext",
      args: [invoiceId]
    }),
    client.readContract({
      address,
      abi: invoiceEscrowAbi,
      functionName: "settlementReceiptHash",
      args: [invoiceId]
    })
  ]);

  const invoice = toInvoiceRecord(invoiceId, invoiceRaw);
  const bond = toBondContextRecord(bondContextRaw);
  invoice.serviceBondAmount = bond.activeAmount;
  invoice.resolvedBondAmount = bond.resolvedAmount;
  invoice.resolvedBondRecipient = bond.resolvedRecipient;
  invoice.serviceBondSlashed = bond.slashed;

  return {
    address,
    chain: client.chain,
    invoice,
    agentContext: toAgentContextRecord(agentContextRaw),
    paymentRequirementHash,
    receiptHash
  };
}

function toInvoiceRecord(id: bigint, raw: unknown): InvoiceRecord {
  const value = raw as Record<string, unknown> & readonly unknown[];
  return {
    id,
    creator: (value.creator ?? value[0]) as `0x${string}`,
    payer: (value.payer ?? value[1]) as `0x${string}`,
    recipient: (value.recipient ?? value[2]) as `0x${string}`,
    token: (value.token ?? value[3]) as `0x${string}`,
    amount: BigInt(value.amount as bigint | string | number | undefined ?? (value[4] as bigint)),
    dueAt: BigInt(value.dueAt as bigint | string | number | undefined ?? (value[5] as bigint)),
    paidAt: BigInt(value.paidAt as bigint | string | number | undefined ?? (value[6] as bigint)),
    timeout: BigInt(value.timeout as bigint | string | number | undefined ?? (value[7] as bigint)),
    refundRequestedAt: BigInt(value.refundRequestedAt as bigint | string | number | undefined ?? (value[8] as bigint)),
    settlementProposedAt: BigInt(value.settlementProposedAt as bigint | string | number | undefined ?? (value[9] as bigint)),
    deliveryMarkedAt: BigInt(value.deliveryMarkedAt as bigint | string | number | undefined ?? (value[10] as bigint)),
    deliveryEvidenceCount: BigInt(value.deliveryEvidenceCount as bigint | string | number | undefined ?? (value[11] as bigint | undefined) ?? 0n),
    disputeMarkedAt: BigInt(value.disputeMarkedAt as bigint | string | number | undefined ?? (value[12] as bigint | undefined) ?? 0n),
    disputeEvidenceCount: BigInt(value.disputeEvidenceCount as bigint | string | number | undefined ?? (value[13] as bigint | undefined) ?? 0n),
    deliveryEvidenceRoot: (value.deliveryEvidenceRoot ?? value[14] ?? zeroHash) as `0x${string}`,
    disputeEvidenceRoot: (value.disputeEvidenceRoot ?? value[15] ?? zeroHash) as `0x${string}`,
    state: Number(value.state ?? value[16]),
    metadataHash: String(value.metadataHash ?? value[17] ?? ""),
    deliveryHash: String(value.deliveryHash ?? value[18] ?? ""),
    disputeHash: String(value.disputeHash ?? value[19] ?? ""),
    settlementMemoHash: String(value.settlementMemoHash ?? value[20] ?? ""),
    settlementProposedBy: (value.settlementProposedBy ?? value[21] ?? zeroAddress) as `0x${string}`,
    settlementRecipientAmount: BigInt(
      value.settlementRecipientAmount as bigint | string | number | undefined ?? (value[22] as bigint | undefined) ?? 0n
    ),
    serviceBondAmount: 0n,
    resolvedBondAmount: 0n,
    resolvedBondRecipient: zeroAddress,
    serviceBondSlashed: false
  };
}

function toBondContextRecord(raw: unknown) {
  const value = raw as Record<string, unknown> & readonly unknown[];
  return {
    activeAmount: BigInt(value.activeAmount as bigint | string | number | undefined ?? (value[0] as bigint | undefined) ?? 0n),
    resolvedAmount: BigInt(value.resolvedAmount as bigint | string | number | undefined ?? (value[1] as bigint | undefined) ?? 0n),
    resolvedRecipient: (value.resolvedRecipient ?? value[2] ?? zeroAddress) as `0x${string}`,
    slashed: Boolean(value.slashed ?? value[3] ?? false)
  };
}

function toAgentContextRecord(raw: unknown): AgentContextRecord {
  const value = raw as Record<string, unknown> & readonly unknown[];
  return {
    payerAgentHash: (value.payerAgentHash ?? value[0] ?? zeroHash) as `0x${string}`,
    recipientAgentHash: (value.recipientAgentHash ?? value[1] ?? zeroHash) as `0x${string}`,
    mandateHash: (value.mandateHash ?? value[2] ?? zeroHash) as `0x${string}`,
    policyHash: (value.policyHash ?? value[3] ?? zeroHash) as `0x${string}`,
    intentMandateHash: (value.intentMandateHash ?? value[4] ?? zeroHash) as `0x${string}`,
    cartMandateHash: (value.cartMandateHash ?? value[5] ?? zeroHash) as `0x${string}`,
    paymentMandateHash: (value.paymentMandateHash ?? value[6] ?? zeroHash) as `0x${string}`,
    promptPlaybackHash: (value.promptPlaybackHash ?? value[7] ?? zeroHash) as `0x${string}`,
    slaDeadline: BigInt(value.slaDeadline as bigint | string | number | undefined ?? (value[8] as bigint | undefined) ?? 0n),
    attachedAt: BigInt(value.attachedAt as bigint | string | number | undefined ?? (value[9] as bigint | undefined) ?? 0n),
    attachedBy: (value.attachedBy ?? value[10] ?? zeroAddress) as `0x${string}`,
    authorizedPayer: (value.authorizedPayer ?? value[11] ?? zeroAddress) as `0x${string}`,
    mandateExpiresAt: BigInt(value.mandateExpiresAt as bigint | string | number | undefined ?? (value[12] as bigint | undefined) ?? 0n)
  };
}
