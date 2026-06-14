const hre = require("hardhat");
const { seedEscrow } = require("./seed");

// Zero-setup local demo: deploys InvoiceEscrow to the in-process Hardhat chain and
// seeds it with invoices across every lifecycle state. Proves the full flow with no
// wallet, key, or testnet funds. Run: pnpm contracts:demo
async function main() {
  const signers = await hre.ethers.getSigners();
  const Escrow = await hre.ethers.getContractFactory("InvoiceEscrow");
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();
  const address = await escrow.getAddress();

  console.log("Local demo on in-process Hardhat chain (chainId 31337)");
  console.log("InvoiceEscrow:", address, "\n");

  await seedEscrow(escrow, signers, hre.ethers.parseEther("0.05"));

  console.log("\nLocal demo complete. To explore in the UI:");
  console.log("  1. npx hardhat node            # persistent local chain");
  console.log("  2. pnpm contracts:demo:node    # deploy + seed against it");
  console.log("  3. pnpm dev                    # open http://localhost:3000, connect to Hardhat (31337)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
