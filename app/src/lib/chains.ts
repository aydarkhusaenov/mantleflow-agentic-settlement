import { defineChain } from "viem";

export const mantleSepolia = defineChain({
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

export const hardhat = defineChain({
  id: 31337,
  name: "Hardhat",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] }
  },
  testnet: true
});

export const supportedChains = [mantleSepolia, hardhat] as const;

export function targetLiveChain() {
  if (process.env.NEXT_PUBLIC_CHAIN_ID === String(hardhat.id)) return hardhat;
  return mantleSepolia;
}

export function explorerBaseForChain(chainId?: number) {
  if (chainId === mantleSepolia.id) return "https://sepolia.mantlescan.xyz";
  return "";
}
