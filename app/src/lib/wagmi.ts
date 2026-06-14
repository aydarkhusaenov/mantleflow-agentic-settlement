import { createConfig, http, injected } from "wagmi";
import { hardhat, mantleSepolia } from "@/lib/chains";

export const wagmiConfig = createConfig({
  chains: [mantleSepolia, hardhat],
  connectors: [injected({ shimDisconnect: true })],
  ssr: true,
  transports: {
    [mantleSepolia.id]: http("https://rpc.sepolia.mantle.xyz"),
    [hardhat.id]: http("http://127.0.0.1:8545")
  }
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
