const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Populates a deployed InvoiceEscrow with demo invoices spanning every lifecycle
// state so the dashboard looks alive for judges. Single-key friendly: the deployer
// acts as creator, payer, and recipient, so escrowed principal returns to it and
// only gas is spent. Override the per-invoice amount with SEED_AMOUNT_ETH.

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const id = (s) => hre.ethers.id(s);

function nativeSymbol(chainId) {
  return chainId === 5003n ? "MNT" : "ETH";
}

function resolveAddress() {
  if (process.env.ESCROW_ADDRESS) return process.env.ESCROW_ADDRESS;
  if (process.env.NEXT_PUBLIC_ESCROW_ADDRESS) return process.env.NEXT_PUBLIC_ESCROW_ADDRESS;
  const artifact = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  if (fs.existsSync(artifact)) {
    return JSON.parse(fs.readFileSync(artifact, "utf8")).address;
  }
  return null;
}

async function newInvoiceId(escrow, tx, label) {
  const receipt = await tx.wait();
  const event = receipt.logs
    .map((log) => {
      try {
        return escrow.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === "InvoiceCreated");
  const invoiceId = event.args.invoiceId;
  console.log(`  #${invoiceId}  ${label}`);
  return invoiceId;
}

// Seeds demo invoices. `signers` is the array from getSigners(). When several funded
// accounts exist (local chain), it uses distinct creator / payer / recipient roles and
// reaches every state including an accepted settlement. With a single funded account
// (live testnet), it uses single-key-safe flows; the negotiated-settlement showcase is
// left as an OPEN proposal (a single key cannot both propose and accept).
async function seedEscrow(escrow, signers, amount) {
  const creator = signers[0];
  const payer = signers[1] ?? signers[0];
  const recipient = signers[2] ?? signers[0];
  const multiParty = payer.address !== creator.address && recipient.address !== payer.address;
  const now = (await hre.ethers.provider.getBlock("latest")).timestamp;
  const ETH = hre.ethers.ZeroAddress;

  console.log(`Roles -> creator: ${creator.address}`);
  console.log(`         payer:   ${payer.address}`);
  console.log(`         recipient: ${recipient.address}`);
  console.log(`Mode: ${multiParty ? "multi-party (full settlement flow)" : "single-key (settlement left as open proposal)"}\n`);

  const create = (metadata, dueAt = now + 30 * DAY, timeout = DAY) =>
    escrow.connect(creator).createInvoice(recipient.address, ETH, amount, metadata, dueAt, timeout);

  // 1. Unpaid invoice, ready to be funded.
  await newInvoiceId(escrow, await create("ipfs://MantleFlow/demo/landing-page-design"), "Created — awaiting payment");

  // 2. Unpaid invoice carrying an agent mandate + SLA (agentic accountability layer).
  const mandateId = await newInvoiceId(
    escrow,
    await create("ipfs://MantleFlow/demo/ai-agent-managed-api-build"),
    "Created — with agent mandate + SLA"
  );
  await (
    await escrow
      .connect(creator)
      .attachAgentMandate(
        mandateId,
        id("erc8004:payer-agent:demo-buyer"),
        id("erc8004:service-agent:demo-builder"),
        id("ap2:mandate: build REST API, release on delivery evidence"),
        id("policy: release only with timely delivery evidence"),
        now + 14 * DAY
      )
  ).wait();

  // 3. Paid invoice with delivery evidence, sitting in escrow.
  const escrowedId = await newInvoiceId(
    escrow,
    await create("ipfs://MantleFlow/demo/brand-identity-kit"),
    "Paid — in escrow with delivery evidence"
  );
  await (await escrow.connect(payer).payInvoice(escrowedId, { value: amount })).wait();
  await (await escrow.connect(recipient).markDelivered(escrowedId, "ipfs://MantleFlow/demo/delivery-brand-kit-v1")).wait();

  // 4. Completed: paid, delivered, released, with post-settlement agent feedback.
  const releasedId = await newInvoiceId(
    escrow,
    await create("ipfs://MantleFlow/demo/smart-contract-audit"),
    "Released — completed with agent feedback"
  );
  await (
    await escrow
      .connect(creator)
      .attachAgentMandate(
        releasedId,
        id("erc8004:payer-agent:demo-client"),
        id("erc8004:service-agent:demo-auditor"),
        id("ap2:mandate: audit contract, release after report"),
        hre.ethers.ZeroHash,
        now + 14 * DAY
      )
  ).wait();
  await (await escrow.connect(payer).payInvoice(releasedId, { value: amount })).wait();
  await (await escrow.connect(recipient).markDelivered(releasedId, "ipfs://MantleFlow/demo/delivery-audit-report")).wait();
  await (await escrow.connect(payer).release(releasedId)).wait();
  // Payer reviews the recipient/service agent against the finalized receipt.
  await (
    await escrow
      .connect(payer)
      .submitAgentFeedback(
        releasedId,
        true,
        95,
        "delivery",
        "on-time",
        "ipfs://MantleFlow/demo/feedback-auditor",
        id("feedback payload: excellent audit")
      )
  ).wait();

  // 5. Refunded: paid, refund requested, recipient-approved refund.
  const refundedId = await newInvoiceId(
    escrow,
    await create("ipfs://MantleFlow/demo/copywriting-retainer", now + 30 * DAY, HOUR),
    "Refunded — payer reimbursed"
  );
  await (await escrow.connect(payer).payInvoice(refundedId, { value: amount })).wait();
  await (await escrow.connect(payer).requestRefund(refundedId)).wait();
  await (await escrow.connect(recipient).refund(refundedId)).wait();

  // 6. Negotiated settlement after a dispute.
  const settledId = await newInvoiceId(
    escrow,
    await create("ipfs://MantleFlow/demo/marketing-campaign"),
    multiParty ? "Settled — negotiated split accepted by counterparty" : "Paid — open 50/50 settlement proposal"
  );
  await (await escrow.connect(payer).payInvoice(settledId, { value: amount })).wait();
  await (await escrow.connect(payer).markDisputed(settledId, "ipfs://MantleFlow/demo/dispute-partial-delivery")).wait();
  await (await escrow.connect(payer).proposeSettlement(settledId, amount / 2n, "ipfs://MantleFlow/demo/settlement-50-50")).wait();
  if (multiParty) {
    // Counterparty (recipient) accepts the proposer's (payer's) split.
    await (await escrow.connect(recipient).acceptSettlement(settledId)).wait();
  }

  const total = await escrow.invoiceCount();
  const states = multiParty
    ? "Created/Paid/Released/Refunded/Settled"
    : "Created/Paid/Released/Refunded (+ open settlement proposal)";
  console.log(`\nDone. Contract now holds ${total} invoices across ${states} states.`);
  return total;
}

async function main() {
  const address = resolveAddress();
  if (!address) {
    throw new Error(
      "No escrow address. Pass ESCROW_ADDRESS=0x..., set NEXT_PUBLIC_ESCROW_ADDRESS in .env, or deploy first so deployments/<network>.json exists."
    );
  }

  const signers = await hre.ethers.getSigners();
  const escrow = await hre.ethers.getContractAt("InvoiceEscrow", address, signers[0]);
  const amount = hre.ethers.parseEther(process.env.SEED_AMOUNT_ETH || "0.0002");
  const net = await hre.ethers.provider.getNetwork();

  console.log(`Seeding ${address} on ${hre.network.name} (chainId ${net.chainId})`);
  console.log(`Per-invoice amount: ${hre.ethers.formatEther(amount)} ${nativeSymbol(net.chainId)}\n`);

  await seedEscrow(escrow, signers, amount);
  console.log("Open the frontend, connect this wallet on the same network, and the dashboard will list them.");
}

module.exports = { seedEscrow };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
