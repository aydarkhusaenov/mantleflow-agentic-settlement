const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const ETH = hre.ethers.ZeroAddress;
const ZERO_HASH = hre.ethers.ZeroHash;

function resolveAddress() {
  if (process.env.ESCROW_ADDRESS) return process.env.ESCROW_ADDRESS;
  if (process.env.NEXT_PUBLIC_ESCROW_ADDRESS) return process.env.NEXT_PUBLIC_ESCROW_ADDRESS;
  const artifact = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  if (fs.existsSync(artifact)) {
    return JSON.parse(fs.readFileSync(artifact, "utf8")).address;
  }
  return null;
}

function explorerBase() {
  if (hre.network.name === "mantleSepolia") return "https://sepolia.mantlescan.xyz";
  return "";
}

async function record(label, txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  const base = explorerBase();
  console.log(`${label}: ${tx.hash}${base ? ` (${base}/tx/${tx.hash})` : ""}`);
  return receipt;
}

async function invoiceIdFrom(receipt, escrow) {
  for (const log of receipt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed.name === "InvoiceCreated") return parsed.args.invoiceId;
    } catch {
      // Ignore unrelated logs.
    }
  }
  throw new Error("InvoiceCreated event not found");
}

async function signPaymentMandate(escrow, invoiceId, signer, overrides) {
  const paymentRequirementHash = await escrow.paymentRequirementHash(invoiceId);
  const { chainId } = await hre.ethers.provider.getNetwork();
  const message = {
    invoiceId,
    payer: signer.address,
    paymentRequirementHash,
    payerAgentHash: overrides.payerAgentHash,
    recipientAgentHash: overrides.recipientAgentHash,
    mandateHash: overrides.mandateHash,
    policyHash: overrides.policyHash,
    slaDeadline: overrides.slaDeadline,
    expiresAt: overrides.expiresAt
  };
  const signature = await signer.signTypedData(
    {
      name: "MantleFlow Agentic Settlement",
      version: "1",
      chainId,
      verifyingContract: await escrow.getAddress()
    },
    {
      PaymentMandate: [
        { name: "invoiceId", type: "uint256" },
        { name: "payer", type: "address" },
        { name: "paymentRequirementHash", type: "bytes32" },
        { name: "payerAgentHash", type: "bytes32" },
        { name: "recipientAgentHash", type: "bytes32" },
        { name: "mandateHash", type: "bytes32" },
        { name: "policyHash", type: "bytes32" },
        { name: "slaDeadline", type: "uint64" },
        { name: "expiresAt", type: "uint64" }
      ]
    },
    message
  );
  return { ...message, signature };
}

async function signValidation(escrow, invoiceId, validator, subjectAgentHash, nonce) {
  const receiptHash = await escrow.settlementReceiptHash(invoiceId);
  const evidenceURI = "ipfs://MantleFlow/live-demo/validator-attestation";
  const expiresAt = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp + DAY);
  const validatorAgentHash = hre.ethers.id("erc8004:validator-agent:live-demo");
  const schemaHash = hre.ethers.id("schema:MantleFlow-live-demo-validation-v1");
  const evidenceHash = hre.ethers.id("live demo validation evidence");
  const teeAttestationHash = hre.ethers.id("tee:live-demo-validator-attestation");
  const { chainId } = await hre.ethers.provider.getNetwork();
  const message = {
    invoiceId,
    validator: validator.address,
    validatorAgentHash,
    subjectAgentHash,
    approved: true,
    score: 93,
    receiptHash,
    schemaHash,
    evidenceURIHash: hre.ethers.id(evidenceURI),
    evidenceHash,
    teeAttestationHash,
    expiresAt,
    nonce
  };
  const signature = await validator.signTypedData(
    {
      name: "MantleFlow Agentic Settlement",
      version: "1",
      chainId,
      verifyingContract: await escrow.getAddress()
    },
    {
      ValidationAttestation: [
        { name: "invoiceId", type: "uint256" },
        { name: "validator", type: "address" },
        { name: "validatorAgentHash", type: "bytes32" },
        { name: "subjectAgentHash", type: "bytes32" },
        { name: "approved", type: "bool" },
        { name: "score", type: "int128" },
        { name: "receiptHash", type: "bytes32" },
        { name: "schemaHash", type: "bytes32" },
        { name: "evidenceURIHash", type: "bytes32" },
        { name: "evidenceHash", type: "bytes32" },
        { name: "teeAttestationHash", type: "bytes32" },
        { name: "expiresAt", type: "uint64" },
        { name: "nonce", type: "uint256" }
      ]
    },
    message
  );
  return {
    invoiceId,
    validator: validator.address,
    validatorAgentHash,
    subjectAgentHash,
    approved: true,
    score: 93,
    schemaHash,
    evidenceURI,
    evidenceHash,
    teeAttestationHash,
    expiresAt,
    nonce,
    signature
  };
}

async function main() {
  const address = resolveAddress();
  if (!address) {
    throw new Error("No escrow address. Deploy first or set ESCROW_ADDRESS/NEXT_PUBLIC_ESCROW_ADDRESS.");
  }

  const [actor] = await hre.ethers.getSigners();
  const escrow = await hre.ethers.getContractAt("InvoiceEscrow", address, actor);
  const amount = hre.ethers.parseEther(process.env.DEMO_AMOUNT_ETH || "0.0002");
  const bond = hre.ethers.parseEther(process.env.DEMO_BOND_ETH || "0.00005");
  const now = (await hre.ethers.provider.getBlock("latest")).timestamp;
  const base = explorerBase();

  console.log(`MantleFlow live demo on ${hre.network.name}`);
  console.log(`Contract: ${address}${base ? ` (${base}/address/${address})` : ""}`);
  console.log(`Actor:    ${actor.address}`);
  console.log(`Amount:   ${hre.ethers.formatEther(amount)} ETH\n`);

  const createReceipt = await record(
    "1. Create invoice",
    escrow.createInvoice(actor.address, ETH, amount, "ipfs://MantleFlow/live-demo/autonomous-agent-loop", now + 7 * DAY, HOUR)
  );
  const invoiceId = await invoiceIdFrom(createReceipt, escrow);
  console.log(`   invoiceId: ${invoiceId}`);
  console.log(`   paymentRequirementHash: ${await escrow.paymentRequirementHash(invoiceId)}\n`);

  const payerAgentHash = hre.ethers.id("erc8004:payer-agent:live-demo");
  const recipientAgentHash = hre.ethers.id("erc8004:service-agent:live-demo");
  const mandate = await signPaymentMandate(escrow, invoiceId, actor, {
    payerAgentHash,
    recipientAgentHash,
    mandateHash: hre.ethers.id("ap2:live-demo intent cart payment mandate"),
    policyHash: hre.ethers.id("policy:demo release after delivery evidence"),
    slaDeadline: BigInt(now + 2 * HOUR),
    expiresAt: BigInt(now + DAY)
  });

  await record(
    "2. Attach signed mandate",
    escrow.attachSignedAgentMandate(
      invoiceId,
      actor.address,
      mandate.payerAgentHash,
      mandate.recipientAgentHash,
      mandate.mandateHash,
      mandate.policyHash,
      mandate.slaDeadline,
      mandate.expiresAt,
      mandate.signature
    )
  );
  await record("3. Post service bond", escrow.postServiceBond(invoiceId, bond, { value: bond }));
  await record("4. Pay invoice", escrow.payInvoice(invoiceId, { value: amount }));
  await record("5. Mark delivered", escrow.markDelivered(invoiceId, "ipfs://MantleFlow/live-demo/delivery-proof"));
  await record("6. Release funds", escrow.release(invoiceId));

  const receiptHash = await escrow.settlementReceiptHash(invoiceId);
  await record(
    "7. Submit feedback",
    escrow.submitAgentFeedback(
      invoiceId,
      true,
      96,
      "demo",
      "settled",
      "ipfs://MantleFlow/live-demo/feedback",
      hre.ethers.id("live demo feedback payload")
    )
  );
  const attestation = await signValidation(escrow, invoiceId, actor, recipientAgentHash, BigInt(Date.now()));
  await record("8. Submit validator attestation", escrow.submitAgentValidation(attestation));

  console.log("\nDemo complete.");
  console.log(`Invoice:       #${invoiceId}`);
  console.log(`Final state:   ${(await escrow.getInvoice(invoiceId)).state}`);
  console.log(`Receipt hash:  ${receiptHash}`);
  console.log(`Feedback root: ${(await escrow.getFeedbackContext(invoiceId)).root}`);
  console.log(`Validation:    ${(await escrow.getValidationContext(invoiceId)).root}`);
  console.log("\nCopy these transaction hashes into docs/ONCHAIN.md before final submission.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
