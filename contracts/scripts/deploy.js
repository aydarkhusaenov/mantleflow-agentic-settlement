const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const EXPLORERS = {
  mantleSepolia: "https://sepolia.mantlescan.xyz"
};

function explorerBase(networkName, chainId) {
  if (EXPLORERS[networkName]) return EXPLORERS[networkName];
  if (chainId === 5003n) return EXPLORERS.mantleSepolia;
  return "";
}

function networkScriptSuffix(networkName) {
  if (networkName === "mantleSepolia") return "mantle-sepolia";
  return "mantle-sepolia";
}

function nativeSymbol(chainId) {
  if (chainId === 5003n) return "MNT";
  return "ETH";
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer account found. Set PRIVATE_KEY in the repo-root .env before deploying to a live network."
    );
  }

  const network = await hre.ethers.provider.getNetwork();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Network:", hre.network.name, `(chainId ${network.chainId})`);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), nativeSymbol(network.chainId));
  if (balance === 0n && hre.network.name !== "hardhat") {
    throw new Error(`Deployer balance is 0. Fund the wallet with testnet MNT for ${hre.network.name} before deploying.`);
  }

  console.log("Preparing InvoiceEscrow deployment transaction...");
  const Escrow = await hre.ethers.getContractFactory("InvoiceEscrow");
  const deployOptions = {};
  if (process.env.DEPLOY_GAS_LIMIT) {
    deployOptions.gasLimit = BigInt(process.env.DEPLOY_GAS_LIMIT);
    console.log("Using explicit gas limit:", deployOptions.gasLimit.toString());
  }
  const escrow = await Escrow.deploy(deployOptions);
  const deployTx = escrow.deploymentTransaction();
  if (deployTx) console.log("Deployment submitted:", deployTx.hash);
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  const receipt = deployTx ? await deployTx.wait() : null;
  const base = explorerBase(hre.network.name, network.chainId);

  const record = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    contract: "InvoiceEscrow",
    address,
    deployer: deployer.address,
    deploymentTx: deployTx ? deployTx.hash : null,
    blockNumber: receipt ? receipt.blockNumber : null,
    explorerAddress: base ? `${base}/address/${address}` : null,
    explorerTx: base && deployTx ? `${base}/tx/${deployTx.hash}` : null,
    timestamp: new Date().toISOString()
  };

  console.log("\nInvoiceEscrow deployed");
  console.log("Address:", record.address);
  if (record.deploymentTx) console.log("Tx:", record.deploymentTx);
  if (record.explorerAddress) console.log("Explorer:", record.explorerAddress);

  // Persist a machine-readable artifact.
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const artifactPath = path.join(deploymentsDir, `${hre.network.name}.json`);
  fs.writeFileSync(artifactPath, `${JSON.stringify(record, null, 2)}\n`);
  console.log("\nSaved deployment record:", path.relative(path.join(__dirname, "..", ".."), artifactPath));

  // Update docs/deployment.md between markers so the submission doc is always current.
  updateDeploymentDoc(record, base);

  const suffix = networkScriptSuffix(hre.network.name);
  console.log("\nNext steps:");
  console.log(`  1. Set in repo-root .env:          NEXT_PUBLIC_ESCROW_ADDRESS=${record.address}`);
  console.log(`  2. (optional) Seed demo invoices:    pnpm contracts:seed:${suffix}`);
  if (base) {
    console.log(
      `  3. (optional) Verify source:         pnpm --filter @mantleflow/contracts verify:${suffix} ${record.address}`
    );
  }
}

function updateDeploymentDoc(record, base) {
  const docPath = path.join(__dirname, "..", "..", "docs", "deployment.md");
  if (!fs.existsSync(docPath)) return;
  const begin = "<!-- DEPLOYMENT:BEGIN -->";
  const end = "<!-- DEPLOYMENT:END -->";
  const block = [
    begin,
    "",
    `- Status: **Deployed**`,
    `- Network: \`${record.network}\` (chainId \`${record.chainId}\`)`,
    `- Contract address: \`${record.address}\``,
    `- Deployment transaction: \`${record.deploymentTx ?? "n/a"}\``,
    `- Block number: \`${record.blockNumber ?? "n/a"}\``,
    `- Deployer: \`${record.deployer}\``,
    record.explorerAddress ? `- Explorer (address): ${record.explorerAddress}` : null,
    record.explorerTx ? `- Explorer (tx): ${record.explorerTx}` : null,
    `- Recorded at: ${record.timestamp}`,
    "",
    end
  ]
    .filter((line) => line !== null)
    .join("\n");

  let doc = fs.readFileSync(docPath, "utf8");
  if (doc.includes(begin) && doc.includes(end)) {
    doc = doc.replace(new RegExp(`${begin}[\\s\\S]*?${end}`), block);
  } else {
    doc += `\n\n## Live Deployment Record\n\n${block}\n`;
  }
  fs.writeFileSync(docPath, doc);
  console.log("Updated docs/deployment.md deployment record.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
