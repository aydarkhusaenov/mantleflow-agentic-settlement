const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const ZERO_ADDRESS = ethers.ZeroAddress;
const ZERO_HASH = ethers.ZeroHash;
const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const PermitAction = {
  Release: 0,
  RequestRefund: 1,
  Refund: 2,
  MarkDelivered: 3,
  MarkDisputed: 4,
  ProposeSettlement: 5,
  CancelSettlementProposal: 6,
  AcceptSettlement: 7
};
const ONE_WORD = "0x0000000000000000000000000000000000000000000000000000000000000001";
const HIGH_S_WORD = "0x8000000000000000000000000000000000000000000000000000000000000000";

async function latestTimestamp() {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp;
}

async function increaseTime(seconds) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

function rawSignature(v, s = ONE_WORD) {
  return ethers.concat([ONE_WORD, s, v]);
}

describe("InvoiceEscrow", function () {
  let escrow;
  let token;
  let feeToken;
  let authToken;
  let creator;
  let recipient;
  let payer;
  let other;

  beforeEach(async function () {
    [creator, recipient, payer, other] = await ethers.getSigners();

    const Escrow = await ethers.getContractFactory("InvoiceEscrow");
    escrow = await Escrow.deploy();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    token = await MockERC20.deploy();

    const MockFeeERC20 = await ethers.getContractFactory("MockFeeERC20");
    feeToken = await MockFeeERC20.deploy();

    const MockEIP3009Token = await ethers.getContractFactory("MockEIP3009Token");
    authToken = await MockEIP3009Token.deploy();
  });

  async function createEthInvoice(overrides = {}) {
    const now = await latestTimestamp();
    const params = {
      recipient: recipient.address,
      token: ZERO_ADDRESS,
      amount: ethers.parseEther("1"),
      metadataHash: "ipfs://invoice-001",
      dueAt: now + DAY,
      timeout: DAY,
      ...overrides
    };

    const tx = await escrow
      .connect(creator)
      .createInvoice(params.recipient, params.token, params.amount, params.metadataHash, params.dueAt, params.timeout);
    const receipt = await tx.wait();
    const event = receipt.logs.find((log) => log.fragment && log.fragment.name === "InvoiceCreated");
    return { id: event.args.invoiceId, params };
  }

  async function createTokenInvoice(testToken = token, overrides = {}) {
    const now = await latestTimestamp();
    const params = {
      recipient: recipient.address,
      token: await testToken.getAddress(),
      amount: ethers.parseUnits("100", 18),
      metadataHash: "ipfs://token-invoice",
      dueAt: now + DAY,
      timeout: DAY,
      ...overrides
    };
    const tx = await escrow
      .connect(creator)
      .createInvoice(params.recipient, params.token, params.amount, params.metadataHash, params.dueAt, params.timeout);
    const receipt = await tx.wait();
    const event = receipt.logs.find((log) => log.fragment && log.fragment.name === "InvoiceCreated");
    return { id: event.args.invoiceId, params };
  }

  async function expectProtocolSolvent(tokens, accounts) {
    const escrowAddress = await escrow.getAddress();
    const expectedByToken = new Map(tokens.map((entry) => [entry.address.toLowerCase(), 0n]));
    const count = await escrow.invoiceCount();

    for (let i = 0n; i < count; i++) {
      const invoice = await escrow.getInvoice(i);
      const tokenKey = invoice.token.toLowerCase();
      if (!expectedByToken.has(tokenKey)) expectedByToken.set(tokenKey, 0n);
      const state = Number(invoice.state);
      if (state === 1 || state === 2) {
        expectedByToken.set(tokenKey, expectedByToken.get(tokenKey) + invoice.amount);
      }

      const bond = await escrow.getBondContext(i);
      if (bond.activeAmount > 0n) {
        expectedByToken.set(tokenKey, expectedByToken.get(tokenKey) + bond.activeAmount);
      }
    }

    for (const account of accounts) {
      for (const entry of tokens) {
        const tokenKey = entry.address.toLowerCase();
        expectedByToken.set(tokenKey, expectedByToken.get(tokenKey) + (await escrow.withdrawable(account, entry.address)));
      }
    }

    for (const entry of tokens) {
      const expected = expectedByToken.get(entry.address.toLowerCase());
      const actual =
        entry.address === ZERO_ADDRESS
          ? await ethers.provider.getBalance(escrowAddress)
          : await entry.contract.balanceOf(escrowAddress);
      expect(actual).to.be.gte(expected);
    }
  }

  async function signPaymentMandate(id, signer, authorizedPayer, overrides = {}) {
    const now = await latestTimestamp();
    const payerAgentHash = overrides.payerAgentHash ?? ethers.id("erc8004:payer-agent:signed-checkout");
    const recipientAgentHash = overrides.recipientAgentHash ?? ethers.id("erc8004:service-agent:signed-checkout");
    const mandateHash = overrides.mandateHash ?? ethers.id("ap2:signed user mandate");
    const policyHash = overrides.policyHash ?? ethers.id("policy:signed payment scope");
    const slaDeadline = overrides.slaDeadline ?? now + DAY;
    const mandateExpiresAt = overrides.mandateExpiresAt ?? now + DAY;
    const paymentRequirementHash = await escrow.paymentRequirementHash(id);
    const { chainId } = await ethers.provider.getNetwork();
    const domain = {
      name: "MantleFlow Agentic Settlement",
      version: "1",
      chainId,
      verifyingContract: await escrow.getAddress()
    };
    const types = {
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
    };
    const value = {
      invoiceId: id,
      payer: authorizedPayer.address,
      paymentRequirementHash,
      payerAgentHash,
      recipientAgentHash,
      mandateHash,
      policyHash,
      slaDeadline,
      expiresAt: mandateExpiresAt
    };
    const signature = await signer.signTypedData(domain, types, value);
    return { payerAgentHash, recipientAgentHash, mandateHash, policyHash, slaDeadline, mandateExpiresAt, signature };
  }

  async function signActionPermit(id, signer, executor, action, recipientAmount = 0n, dataHash = "", nonce = 1n, overrides = {}) {
    const now = await latestTimestamp();
    const validAfter = overrides.validAfter ?? 0;
    const expiresAt = overrides.expiresAt ?? now + DAY;
    const paramsHash = await escrow.actionParamsHash(action, recipientAmount, dataHash);
    const { chainId } = await ethers.provider.getNetwork();
    const domain = {
      name: "MantleFlow Agentic Settlement",
      version: "1",
      chainId,
      verifyingContract: await escrow.getAddress()
    };
    const types = {
      ActionPermit: [
        { name: "invoiceId", type: "uint256" },
        { name: "action", type: "uint8" },
        { name: "signer", type: "address" },
        { name: "executor", type: "address" },
        { name: "paramsHash", type: "bytes32" },
        { name: "validAfter", type: "uint64" },
        { name: "expiresAt", type: "uint64" },
        { name: "nonce", type: "uint256" }
      ]
    };
    const value = {
      invoiceId: id,
      action,
      signer: signer.address,
      executor,
      paramsHash,
      validAfter,
      expiresAt,
      nonce
    };
    const signature = await signer.signTypedData(domain, types, value);
    return {
      paramsHash,
      call: {
        invoiceId: id,
        action,
        signer: signer.address,
        executor,
        recipientAmount,
        dataHash,
        validAfter,
        expiresAt,
        nonce,
        signature
      }
    };
  }

  async function signValidationAttestation(id, validator, subjectAgentHash, overrides = {}) {
    const now = await latestTimestamp();
    const validatorAgentHash = overrides.validatorAgentHash ?? ethers.id("erc8004:validator-agent:receipt-auditor");
    const approved = overrides.approved ?? true;
    const score = overrides.score ?? 92;
    const schemaHash = overrides.schemaHash ?? ethers.id("schema:MantleFlow-delivery-validation-v1");
    const evidenceURI = overrides.evidenceURI ?? "ipfs://validator-attestation";
    const evidenceHash = overrides.evidenceHash ?? ethers.id("validator evidence payload");
    const teeAttestationHash = overrides.teeAttestationHash ?? ZERO_HASH;
    const expiresAt = overrides.expiresAt ?? now + DAY;
    const nonce = overrides.nonce ?? 1n;
    const receiptHash = overrides.receiptHash ?? (await escrow.settlementReceiptHash(id));
    const evidenceURIHash = ethers.id(evidenceURI);
    const { chainId } = await ethers.provider.getNetwork();
    const domain = {
      name: "MantleFlow Agentic Settlement",
      version: "1",
      chainId,
      verifyingContract: await escrow.getAddress()
    };
    const types = {
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
    };
    const value = {
      invoiceId: id,
      validator: validator.address,
      validatorAgentHash,
      subjectAgentHash,
      approved,
      score,
      receiptHash,
      schemaHash,
      evidenceURIHash,
      evidenceHash,
      teeAttestationHash,
      expiresAt,
      nonce
    };
    const signature = await validator.signTypedData(domain, types, value);
    return {
      validatorAgentHash,
      approved,
      score,
      schemaHash,
      evidenceURI,
      evidenceHash,
      teeAttestationHash,
      receiptHash,
      nonce,
      call: {
        invoiceId: id,
        validator: validator.address,
        validatorAgentHash,
        subjectAgentHash,
        approved,
        score,
        schemaHash,
        evidenceURI,
        evidenceHash,
        teeAttestationHash,
        expiresAt,
        nonce,
        signature
      }
    };
  }

  it("creates invoices with expected fields", async function () {
    const { id, params } = await createEthInvoice();

    const invoice = await escrow.getInvoice(id);
    expect(invoice.creator).to.equal(creator.address);
    expect(invoice.recipient).to.equal(recipient.address);
    expect(invoice.token).to.equal(params.token);
    expect(invoice.amount).to.equal(params.amount);
    expect(invoice.metadataHash).to.equal(params.metadataHash);
    expect(invoice.deliveryEvidenceCount).to.equal(0);
    expect(invoice.disputeEvidenceCount).to.equal(0);
    expect(invoice.deliveryEvidenceRoot).to.equal(ZERO_HASH);
    expect(invoice.disputeEvidenceRoot).to.equal(ZERO_HASH);
    expect(invoice.state).to.equal(0);
  });

  it("rejects invalid invoice inputs", async function () {
    await expect(
      escrow.connect(creator).createInvoice(ZERO_ADDRESS, ZERO_ADDRESS, 1, "bad", 0, DAY)
    ).to.be.revertedWithCustomError(escrow, "InvalidRecipient");

    await expect(
      escrow.connect(creator).createInvoice(recipient.address, ZERO_ADDRESS, 0, "bad", 0, DAY)
    ).to.be.revertedWithCustomError(escrow, "InvalidAmount");

    await expect(
      escrow.connect(creator).createInvoice(recipient.address, ZERO_ADDRESS, 1, "bad", 0, 0)
    ).to.be.revertedWithCustomError(escrow, "InvalidTimeout");
  });

  it("cancels unpaid invoices only by creator or recipient", async function () {
    const { id } = await createEthInvoice();

    await expect(escrow.connect(other).cancelUnpaid(id)).to.be.revertedWithCustomError(escrow, "Unauthorized");
    await escrow.connect(creator).cancelUnpaid(id);

    const invoice = await escrow.getInvoice(id);
    expect(invoice.state).to.equal(5);
  });

  it("pays a native-token invoice with exact value", async function () {
    const { id, params } = await createEthInvoice();

    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    const invoice = await escrow.getInvoice(id);
    expect(invoice.payer).to.equal(payer.address);
    expect(invoice.state).to.equal(1);
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(params.amount);
  });

  it("attaches agent mandate context and exposes receipt hash", async function () {
    const { id } = await createEthInvoice();
    const now = await latestTimestamp();
    const payerAgentHash = ethers.id("erc8004:payer-agent:invoice-risk-policy");
    const recipientAgentHash = ethers.id("erc8004:recipient-agent:web-delivery-service");
    const mandateHash = ethers.id("ap2-like mandate: buy landing page for 0.05 ETH");
    const policyHash = ethers.id("policy: release only after delivery evidence");
    const slaDeadline = now + DAY;

    await expect(
      escrow
        .connect(creator)
        .attachAgentMandate(id, payerAgentHash, recipientAgentHash, mandateHash, policyHash, slaDeadline)
    )
      .to.emit(escrow, "AgentMandateAttached")
      .withArgs(
        id,
        creator.address,
        payerAgentHash,
        recipientAgentHash,
        mandateHash,
        policyHash,
        ZERO_HASH,
        ZERO_HASH,
        mandateHash,
        policyHash,
        slaDeadline,
        ZERO_ADDRESS,
        0
      );

    const context = await escrow.getAgentContext(id);
    expect(context.payerAgentHash).to.equal(payerAgentHash);
    expect(context.recipientAgentHash).to.equal(recipientAgentHash);
    expect(context.mandateHash).to.equal(mandateHash);
    expect(context.policyHash).to.equal(policyHash);
    expect(context.intentMandateHash).to.equal(ZERO_HASH);
    expect(context.cartMandateHash).to.equal(ZERO_HASH);
    expect(context.paymentMandateHash).to.equal(mandateHash);
    expect(context.promptPlaybackHash).to.equal(policyHash);
    expect(context.slaDeadline).to.equal(slaDeadline);
    expect(context.attachedBy).to.equal(creator.address);
    expect(context.authorizedPayer).to.equal(ZERO_ADDRESS);
    expect(context.mandateExpiresAt).to.equal(0);

    const receiptHash = await escrow.settlementReceiptHash(id);
    expect(receiptHash).to.not.equal(ZERO_HASH);
  });

  it("attaches AP2 mandate hashes and preserves them in receipt context", async function () {
    const { id } = await createEthInvoice();
    const now = await latestTimestamp();
    const payerAgentHash = ethers.id("erc8004:payer-agent:ap2");
    const recipientAgentHash = ethers.id("erc8004:recipient-agent:ap2");
    const intentMandateHash = ethers.id("ap2:intent mandate");
    const cartMandateHash = ethers.id("ap2:cart mandate");
    const paymentMandateHash = ethers.id("ap2:payment mandate");
    const promptPlaybackHash = ethers.id("agent:prompt playback");
    const policyHash = ethers.id("policy:ap2 delivery");
    const slaDeadline = now + DAY;

    await expect(
      escrow
        .connect(creator)
        .attachAP2AgentMandate(
          id,
          payerAgentHash,
          recipientAgentHash,
          intentMandateHash,
          cartMandateHash,
          paymentMandateHash,
          promptPlaybackHash,
          policyHash,
          slaDeadline
        )
    )
      .to.emit(escrow, "AgentMandateAttached")
      .withArgs(
        id,
        creator.address,
        payerAgentHash,
        recipientAgentHash,
        paymentMandateHash,
        policyHash,
        intentMandateHash,
        cartMandateHash,
        paymentMandateHash,
        promptPlaybackHash,
        slaDeadline,
        ZERO_ADDRESS,
        0
      );

    const context = await escrow.getAgentContext(id);
    expect(context.mandateHash).to.equal(paymentMandateHash);
    expect(context.intentMandateHash).to.equal(intentMandateHash);
    expect(context.cartMandateHash).to.equal(cartMandateHash);
    expect(context.paymentMandateHash).to.equal(paymentMandateHash);
    expect(context.promptPlaybackHash).to.equal(promptPlaybackHash);
    expect(await escrow.settlementReceiptHash(id)).to.not.equal(ZERO_HASH);

    const invalidMandate = await createEthInvoice();
    await expect(
      escrow
        .connect(creator)
        .attachAP2AgentMandate(
          invalidMandate.id,
          payerAgentHash,
          recipientAgentHash,
          intentMandateHash,
          cartMandateHash,
          ZERO_HASH,
          promptPlaybackHash,
          policyHash,
          0
        )
    ).to.be.revertedWithCustomError(escrow, "InvalidMandate");

    const unauthorized = await createEthInvoice();
    await expect(
      escrow
        .connect(other)
        .attachAP2AgentMandate(
          unauthorized.id,
          payerAgentHash,
          recipientAgentHash,
          intentMandateHash,
          cartMandateHash,
          paymentMandateHash,
          promptPlaybackHash,
          policyHash,
          0
        )
    ).to.be.revertedWithCustomError(escrow, "Unauthorized");

    const paid = await createEthInvoice();
    await escrow.connect(payer).payInvoice(paid.id, { value: paid.params.amount });
    await expect(
      escrow
        .connect(creator)
        .attachAP2AgentMandate(
          paid.id,
          payerAgentHash,
          recipientAgentHash,
          intentMandateHash,
          cartMandateHash,
          paymentMandateHash,
          promptPlaybackHash,
          policyHash,
          0
        )
    ).to.be.revertedWithCustomError(escrow, "InvalidState");
  });

  it("exposes an x402-style payment requirement hash bound to invoice terms", async function () {
    const { id } = await createEthInvoice();

    const requirementHash = await escrow.paymentRequirementHash(id);
    expect(requirementHash).to.not.equal(ZERO_HASH);

    const otherInvoice = await createEthInvoice({ metadataHash: "ipfs://invoice-002" });
    expect(await escrow.paymentRequirementHash(otherInvoice.id)).to.not.equal(requirementHash);
  });

  it("exposes an EIP-5267 EIP-712 domain", async function () {
    const { chainId } = await ethers.provider.getNetwork();
    const domain = await escrow.eip712Domain();

    expect(domain.fields).to.equal("0x0f");
    expect(domain.name).to.equal("MantleFlow Agentic Settlement");
    expect(domain.version).to.equal("1");
    expect(domain.chainId).to.equal(chainId);
    expect(domain.verifyingContract).to.equal(await escrow.getAddress());
    expect(domain.salt).to.equal(ZERO_HASH);
    expect(domain.extensions.length).to.equal(0);
    expect(await escrow.eip712DomainSeparator()).to.not.equal(ZERO_HASH);
  });

  it("funds token invoices through x402-style EIP-3009 receiveWithAuthorization", async function () {
    const { id, params } = await createTokenInvoice(authToken);
    await authToken.mint(payer.address, params.amount);
    const now = await latestTimestamp();
    const nonce = await escrow.paymentRequirementHash(id);

    await expect(
      escrow
        .connect(other)
        .payInvoiceWithAuthorization(id, payer.address, 0, now + DAY, nonce, 27, ONE_WORD, ONE_WORD)
    )
      .to.emit(escrow, "InvoicePaid")
      .withArgs(id, payer.address, await authToken.getAddress(), params.amount);

    const invoice = await escrow.getInvoice(id);
    expect(invoice.state).to.equal(1);
    expect(invoice.payer).to.equal(payer.address);
    expect(await authToken.balanceOf(await escrow.getAddress())).to.equal(params.amount);
    expect(await authToken.authorizationState(payer.address, nonce)).to.equal(true);
  });

  it("rejects invalid EIP-3009 escrow funding inputs", async function () {
    const { id, params } = await createTokenInvoice(authToken);
    await authToken.mint(payer.address, params.amount * 4n);
    const now = await latestTimestamp();
    const nonce = await escrow.paymentRequirementHash(id);

    await expect(
      escrow.connect(other).payInvoiceWithAuthorization(id, payer.address, 0, now + DAY, ethers.id("wrong invoice"), 27, ONE_WORD, ONE_WORD)
    ).to.be.revertedWithCustomError(escrow, "InvalidAuthorizationNonce");

    await expect(
      escrow.connect(other).payInvoiceWithAuthorization(id, ZERO_ADDRESS, 0, now + DAY, nonce, 27, ONE_WORD, ONE_WORD)
    ).to.be.revertedWithCustomError(escrow, "InvalidPayer");

    await expect(
      escrow.connect(other).payInvoiceWithAuthorization(id, payer.address, 0, now + DAY, nonce, 27, ONE_WORD, ONE_WORD, {
        value: 1
      })
    ).to.be.revertedWithCustomError(escrow, "IncorrectPayment");

    const ethInvoice = await createEthInvoice();
    await expect(
      escrow
        .connect(other)
        .payInvoiceWithAuthorization(
          ethInvoice.id,
          payer.address,
          0,
          now + DAY,
          await escrow.paymentRequirementHash(ethInvoice.id),
          27,
          ONE_WORD,
          ONE_WORD
        )
    ).to.be.revertedWithCustomError(escrow, "IncorrectPayment");

    await escrow.connect(other).payInvoiceWithAuthorization(id, payer.address, 0, now + DAY, nonce, 27, ONE_WORD, ONE_WORD);
    await expect(
      escrow.connect(other).payInvoiceWithAuthorization(id, payer.address, 0, now + DAY, nonce, 27, ONE_WORD, ONE_WORD)
    ).to.be.revertedWithCustomError(escrow, "InvalidState");
  });

  it("rejects past-due and underfunded EIP-3009 escrow funding", async function () {
    const now = await latestTimestamp();
    const pastDue = await createTokenInvoice(authToken, { dueAt: now + HOUR });
    await authToken.mint(payer.address, pastDue.params.amount);
    await increaseTime(HOUR + 1);
    const afterDue = await latestTimestamp();

    await expect(
      escrow
        .connect(other)
        .payInvoiceWithAuthorization(
          pastDue.id,
          payer.address,
          0,
          afterDue + DAY,
          await escrow.paymentRequirementHash(pastDue.id),
          27,
          ONE_WORD,
          ONE_WORD
        )
    ).to.be.revertedWithCustomError(escrow, "InvoicePastDue");

    const underfunded = await createTokenInvoice(authToken);
    await authToken.mint(payer.address, underfunded.params.amount);
    await authToken.setTransferShortfall(1);

    await expect(
      escrow
        .connect(other)
        .payInvoiceWithAuthorization(
          underfunded.id,
          payer.address,
          0,
          afterDue + DAY,
          await escrow.paymentRequirementHash(underfunded.id),
          27,
          ONE_WORD,
          ONE_WORD
        )
    ).to.be.revertedWithCustomError(escrow, "IncorrectPayment");
  });

  it("enforces signed mandate payer locks and expiry for EIP-3009 funding", async function () {
    const { id, params } = await createTokenInvoice(authToken);
    await authToken.mint(payer.address, params.amount);
    await authToken.mint(other.address, params.amount);
    const now = await latestTimestamp();
    const signed = await signPaymentMandate(id, payer, payer);

    await escrow.attachSignedAgentMandate(
      id,
      payer.address,
      signed.payerAgentHash,
      signed.recipientAgentHash,
      signed.mandateHash,
      signed.policyHash,
      signed.slaDeadline,
      signed.mandateExpiresAt,
      signed.signature
    );

    await expect(
      escrow
        .connect(creator)
        .payInvoiceWithAuthorization(id, other.address, 0, now + DAY, await escrow.paymentRequirementHash(id), 27, ONE_WORD, ONE_WORD)
    ).to.be.revertedWithCustomError(escrow, "Unauthorized");

    const expiring = await createTokenInvoice(authToken);
    await authToken.mint(payer.address, expiring.params.amount);
    const expiringSigned = await signPaymentMandate(expiring.id, payer, payer, { mandateExpiresAt: now + HOUR });
    await escrow.attachSignedAgentMandate(
      expiring.id,
      payer.address,
      expiringSigned.payerAgentHash,
      expiringSigned.recipientAgentHash,
      expiringSigned.mandateHash,
      expiringSigned.policyHash,
      expiringSigned.slaDeadline,
      expiringSigned.mandateExpiresAt,
      expiringSigned.signature
    );
    await increaseTime(HOUR + 1);
    await expect(
      escrow
        .connect(creator)
        .payInvoiceWithAuthorization(
          expiring.id,
          payer.address,
          0,
          now + DAY,
          await escrow.paymentRequirementHash(expiring.id),
          27,
          ONE_WORD,
          ONE_WORD
        )
    ).to.be.revertedWithCustomError(escrow, "MandateExpired");
  });

  it("attaches a signed payment mandate and restricts payment to authorized payer", async function () {
    const { id, params } = await createEthInvoice();
    const signed = await signPaymentMandate(id, payer, payer);

    await expect(
      escrow
        .connect(other)
        .attachSignedAgentMandate(
          id,
          payer.address,
          signed.payerAgentHash,
          signed.recipientAgentHash,
          signed.mandateHash,
          signed.policyHash,
          signed.slaDeadline,
          signed.mandateExpiresAt,
          signed.signature
        )
    )
      .to.emit(escrow, "AgentMandateAttached")
      .withArgs(
        id,
        other.address,
        signed.payerAgentHash,
        signed.recipientAgentHash,
        signed.mandateHash,
        signed.policyHash,
        ZERO_HASH,
        ZERO_HASH,
        signed.mandateHash,
        signed.policyHash,
        signed.slaDeadline,
        payer.address,
        signed.mandateExpiresAt
      );

    const context = await escrow.getAgentContext(id);
    expect(context.paymentMandateHash).to.equal(signed.mandateHash);
    expect(context.promptPlaybackHash).to.equal(signed.policyHash);
    expect(context.authorizedPayer).to.equal(payer.address);
    expect(context.mandateExpiresAt).to.equal(signed.mandateExpiresAt);

    await expect(escrow.connect(other).payInvoice(id, { value: params.amount })).to.be.revertedWithCustomError(
      escrow,
      "Unauthorized"
    );
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    const invoice = await escrow.getInvoice(id);
    expect(invoice.payer).to.equal(payer.address);
    expect(invoice.state).to.equal(1);
  });

  it("rejects signed mandates from the wrong signer", async function () {
    const { id } = await createEthInvoice();
    const signed = await signPaymentMandate(id, other, payer);

    await expect(
      escrow.attachSignedAgentMandate(
        id,
        payer.address,
        signed.payerAgentHash,
        signed.recipientAgentHash,
        signed.mandateHash,
        signed.policyHash,
        signed.slaDeadline,
        signed.mandateExpiresAt,
        signed.signature
      )
    ).to.be.revertedWithCustomError(escrow, "InvalidSignature");
  });

  it("rejects expired signed mandates and expired authorized payments", async function () {
    const { id, params } = await createEthInvoice({ timeout: HOUR });
    const now = await latestTimestamp();
    const expired = await signPaymentMandate(id, payer, payer, { mandateExpiresAt: now });

    await expect(
      escrow.attachSignedAgentMandate(
        id,
        payer.address,
        expired.payerAgentHash,
        expired.recipientAgentHash,
        expired.mandateHash,
        expired.policyHash,
        expired.slaDeadline,
        expired.mandateExpiresAt,
        expired.signature
      )
    ).to.be.revertedWithCustomError(escrow, "MandateExpired");

    const active = await signPaymentMandate(id, payer, payer, { mandateExpiresAt: now + HOUR });
    await escrow.attachSignedAgentMandate(
      id,
      payer.address,
      active.payerAgentHash,
      active.recipientAgentHash,
      active.mandateHash,
      active.policyHash,
      active.slaDeadline,
      active.mandateExpiresAt,
      active.signature
    );

    await increaseTime(HOUR + 1);
    await expect(escrow.connect(payer).payInvoice(id, { value: params.amount })).to.be.revertedWithCustomError(
      escrow,
      "MandateExpired"
    );
  });

  it("accepts ERC-1271 signed mandates and rejects malformed EOA signatures", async function () {
    const { id } = await createEthInvoice();
    const Wallet = await ethers.getContractFactory("MockERC1271Wallet");
    const contractWallet = await Wallet.deploy();
    const walletAddress = await contractWallet.getAddress();
    const now = await latestTimestamp();
    const payerAgentHash = ethers.id("erc1271:payer-agent");
    const recipientAgentHash = ethers.id("erc1271:recipient-agent");
    const mandateHash = ethers.id("erc1271 mandate");
    const policyHash = ethers.id("erc1271 policy");
    const slaDeadline = now + DAY;
    const mandateExpiresAt = now + DAY;
    const signature = "0x123456";
    const digest = await escrow.paymentMandateDigest(
      id,
      walletAddress,
      payerAgentHash,
      recipientAgentHash,
      mandateHash,
      policyHash,
      slaDeadline,
      mandateExpiresAt
    );

    await contractWallet.setValidation(digest, signature, true);
    await escrow.attachSignedAgentMandate(
      id,
      walletAddress,
      payerAgentHash,
      recipientAgentHash,
      mandateHash,
      policyHash,
      slaDeadline,
      mandateExpiresAt,
      signature
    );

    const context = await escrow.getAgentContext(id);
    expect(context.authorizedPayer).to.equal(walletAddress);

    const otherInvoice = await createEthInvoice();
    const signed = await signPaymentMandate(otherInvoice.id, payer, payer);
    await expect(
      escrow.attachSignedAgentMandate(
        otherInvoice.id,
        payer.address,
        signed.payerAgentHash,
        signed.recipientAgentHash,
        signed.mandateHash,
        signed.policyHash,
        signed.slaDeadline,
        signed.mandateExpiresAt,
        "0x1234"
      )
    ).to.be.revertedWithCustomError(escrow, "InvalidSignature");

    await expect(
      escrow.attachSignedAgentMandate(
        otherInvoice.id,
        payer.address,
        signed.payerAgentHash,
        signed.recipientAgentHash,
        signed.mandateHash,
        signed.policyHash,
        signed.slaDeadline,
        signed.mandateExpiresAt,
        rawSignature("0x1b", HIGH_S_WORD)
      )
    ).to.be.revertedWithCustomError(escrow, "InvalidSignature");

    await expect(
      escrow.attachSignedAgentMandate(
        otherInvoice.id,
        payer.address,
        signed.payerAgentHash,
        signed.recipientAgentHash,
        signed.mandateHash,
        signed.policyHash,
        signed.slaDeadline,
        signed.mandateExpiresAt,
        rawSignature("0x00")
      )
    ).to.be.revertedWithCustomError(escrow, "InvalidSignature");

    await expect(
      escrow.attachSignedAgentMandate(
        otherInvoice.id,
        payer.address,
        signed.payerAgentHash,
        signed.recipientAgentHash,
        signed.mandateHash,
        signed.policyHash,
        signed.slaDeadline,
        signed.mandateExpiresAt,
        rawSignature("0x1d")
      )
    ).to.be.revertedWithCustomError(escrow, "InvalidSignature");
  });

  it("validates signed mandate input guards and supports no-expiry mandates", async function () {
    const { id, params } = await createEthInvoice();
    const signed = await signPaymentMandate(id, payer, payer, { mandateExpiresAt: 0 });

    await expect(
      escrow.attachSignedAgentMandate(
        id,
        ZERO_ADDRESS,
        signed.payerAgentHash,
        signed.recipientAgentHash,
        signed.mandateHash,
        signed.policyHash,
        signed.slaDeadline,
        signed.mandateExpiresAt,
        signed.signature
      )
    ).to.be.revertedWithCustomError(escrow, "InvalidPayer");

    await expect(
      escrow.attachSignedAgentMandate(
        id,
        payer.address,
        signed.payerAgentHash,
        signed.recipientAgentHash,
        ZERO_HASH,
        signed.policyHash,
        signed.slaDeadline,
        signed.mandateExpiresAt,
        signed.signature
      )
    ).to.be.revertedWithCustomError(escrow, "InvalidMandate");

    await escrow.attachSignedAgentMandate(
      id,
      payer.address,
      signed.payerAgentHash,
      signed.recipientAgentHash,
      signed.mandateHash,
      signed.policyHash,
      signed.slaDeadline,
      signed.mandateExpiresAt,
      signed.signature
    );
    expect((await escrow.getAgentContext(id)).mandateExpiresAt).to.equal(0);

    const late = await createEthInvoice();
    const lateSigned = await signPaymentMandate(late.id, payer, payer);
    await escrow.connect(payer).payInvoice(late.id, { value: late.params.amount });
    await expect(
      escrow.attachSignedAgentMandate(
        late.id,
        payer.address,
        lateSigned.payerAgentHash,
        lateSigned.recipientAgentHash,
        lateSigned.mandateHash,
        lateSigned.policyHash,
        lateSigned.slaDeadline,
        lateSigned.mandateExpiresAt,
        lateSigned.signature
      )
    ).to.be.revertedWithCustomError(escrow, "InvalidState");

    await escrow.connect(payer).payInvoice(id, { value: params.amount });
  });

  it("executes a payer-signed refund request permit once through the bound executor", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    const permit = await signActionPermit(id, payer, other.address, PermitAction.RequestRefund, 0n, "", 11n);

    await expect(escrow.connect(other).executeActionPermit(permit.call))
      .to.emit(escrow, "ActionPermitExecuted")
      .withArgs(id, payer.address, other.address, PermitAction.RequestRefund, 11n, permit.paramsHash);

    const invoice = await escrow.getInvoice(id);
    expect(invoice.state).to.equal(2);
    expect(await escrow.usedActionNonces(payer.address, 11n)).to.equal(true);

    await expect(escrow.connect(other).executeActionPermit(permit.call)).to.be.revertedWithCustomError(
      escrow,
      "ActionPermitUsed"
    );
  });

  it("lets a recipient delegate exact delivery evidence while rejecting the wrong executor", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    const permit = await signActionPermit(
      id,
      recipient,
      other.address,
      PermitAction.MarkDelivered,
      0n,
      "ipfs://agent-delivery-evidence",
      12n
    );

    await expect(escrow.connect(creator).executeActionPermit(permit.call)).to.be.revertedWithCustomError(
      escrow,
      "Unauthorized"
    );
    await escrow.connect(other).executeActionPermit(permit.call);

    const invoice = await escrow.getInvoice(id);
    expect(invoice.deliveryHash).to.equal("ipfs://agent-delivery-evidence");
    expect(invoice.deliveryEvidenceCount).to.equal(1);
    expect(await escrow.usedActionNonces(recipient.address, 12n)).to.equal(true);
  });

  it("binds settlement permits to exact amount and memo parameters", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    const recipientAmount = ethers.parseEther("0.65");
    const permit = await signActionPermit(
      id,
      payer,
      other.address,
      PermitAction.ProposeSettlement,
      recipientAmount,
      "ipfs://agent-proposed-65-35",
      13n
    );
    const tampered = { ...permit.call, recipientAmount: recipientAmount + 1n };

    await expect(escrow.connect(other).executeActionPermit(tampered)).to.be.revertedWithCustomError(
      escrow,
      "InvalidSignature"
    );

    await escrow.connect(other).executeActionPermit(permit.call);
    const invoice = await escrow.getInvoice(id);
    expect(invoice.settlementProposedBy).to.equal(payer.address);
    expect(invoice.settlementRecipientAmount).to.equal(recipientAmount);
    expect(invoice.settlementMemoHash).to.equal("ipfs://agent-proposed-65-35");
  });

  it("rejects action permits outside their time window", async function () {
    const { id, params } = await createEthInvoice({ timeout: HOUR });
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    const now = await latestTimestamp();

    const expired = await signActionPermit(id, payer, other.address, PermitAction.RequestRefund, 0n, "", 14n, {
      expiresAt: now
    });
    await expect(escrow.connect(other).executeActionPermit(expired.call)).to.be.revertedWithCustomError(
      escrow,
      "ActionPermitExpired"
    );

    const inactive = await signActionPermit(id, payer, other.address, PermitAction.RequestRefund, 0n, "", 15n, {
      validAfter: now + HOUR
    });
    await expect(escrow.connect(other).executeActionPermit(inactive.call)).to.be.revertedWithCustomError(
      escrow,
      "ActionPermitNotActive"
    );
  });

  it("lets signers cancel action permit nonces before execution", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    const permit = await signActionPermit(id, payer, other.address, PermitAction.RequestRefund, 0n, "", 77n);

    await expect(escrow.connect(payer).cancelActionNonce(77n))
      .to.emit(escrow, "ActionNonceCancelled")
      .withArgs(payer.address, 77n);
    expect(await escrow.usedActionNonces(payer.address, 77n)).to.equal(true);

    await expect(escrow.connect(payer).cancelActionNonce(77n)).to.be.revertedWithCustomError(
      escrow,
      "ActionPermitUsed"
    );
    await expect(escrow.connect(other).executeActionPermit(permit.call)).to.be.revertedWithCustomError(
      escrow,
      "ActionPermitUsed"
    );
    expect((await escrow.getInvoice(id)).state).to.equal(1);
  });

  it("still checks invoice roles against the permit signer, not the relayer", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    const permit = await signActionPermit(id, other, other.address, PermitAction.Release, 0n, "", 16n);

    await expect(escrow.connect(other).executeActionPermit(permit.call)).to.be.revertedWithCustomError(
      escrow,
      "Unauthorized"
    );
    expect(await escrow.usedActionNonces(other.address, 16n)).to.equal(false);
  });

  it("executes the remaining scoped action permit variants", async function () {
    const refundable = await createEthInvoice({ timeout: HOUR });
    await escrow.connect(payer).payInvoice(refundable.id, { value: refundable.params.amount });
    await escrow.connect(payer).requestRefund(refundable.id);
    await increaseTime(HOUR + 1);
    const refundPermit = await signActionPermit(
      refundable.id,
      payer,
      other.address,
      PermitAction.Refund,
      0n,
      "",
      17n
    );
    await escrow.connect(other).executeActionPermit(refundPermit.call);
    expect((await escrow.getInvoice(refundable.id)).state).to.equal(4);

    const disputed = await createEthInvoice();
    await escrow.connect(payer).payInvoice(disputed.id, { value: disputed.params.amount });
    const disputePermit = await signActionPermit(
      disputed.id,
      payer,
      ZERO_ADDRESS,
      PermitAction.MarkDisputed,
      0n,
      "ipfs://permit-dispute",
      18n
    );
    await escrow.connect(other).executeActionPermit(disputePermit.call);
    expect((await escrow.getInvoice(disputed.id)).disputeEvidenceCount).to.equal(1);

    const cancellable = await createEthInvoice();
    await escrow.connect(payer).payInvoice(cancellable.id, { value: cancellable.params.amount });
    await escrow.connect(payer).proposeSettlement(cancellable.id, ethers.parseEther("0.7"), "ipfs://cancel-by-permit");
    const cancelPermit = await signActionPermit(
      cancellable.id,
      payer,
      other.address,
      PermitAction.CancelSettlementProposal,
      0n,
      "",
      19n
    );
    await escrow.connect(other).executeActionPermit(cancelPermit.call);
    expect((await escrow.getInvoice(cancellable.id)).settlementProposedBy).to.equal(ZERO_ADDRESS);

    const acceptable = await createEthInvoice();
    await escrow.connect(payer).payInvoice(acceptable.id, { value: acceptable.params.amount });
    await escrow.connect(payer).proposeSettlement(acceptable.id, ethers.parseEther("0.7"), "ipfs://accept-by-permit");
    const acceptPermit = await signActionPermit(
      acceptable.id,
      recipient,
      other.address,
      PermitAction.AcceptSettlement,
      0n,
      "",
      20n
    );
    await escrow.connect(other).executeActionPermit(acceptPermit.call);
    expect((await escrow.getInvoice(acceptable.id)).state).to.equal(6);
  });

  it("rejects action permits with invalid empty-action parameters", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    const permit = await signActionPermit(id, payer, other.address, PermitAction.Release, 1n, "", 21n);

    await expect(escrow.connect(other).executeActionPermit(permit.call)).to.be.revertedWithCustomError(
      escrow,
      "InvalidActionPermit"
    );
    expect(await escrow.usedActionNonces(payer.address, 21n)).to.equal(false);

    const memoPermit = await signActionPermit(id, payer, other.address, PermitAction.Release, 0n, "ipfs://bad-memo", 22n);
    await expect(escrow.connect(other).executeActionPermit(memoPermit.call)).to.be.revertedWithCustomError(
      escrow,
      "InvalidActionPermit"
    );

    const zeroSignerPermit = { ...permit.call, signer: ZERO_ADDRESS, nonce: 23n };
    await expect(escrow.connect(other).executeActionPermit(zeroSignerPermit)).to.be.revertedWithCustomError(
      escrow,
      "InvalidActionPermit"
    );
  });

  it("rejects evidence action permits with settlement amounts", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    const deliveryPermit = await signActionPermit(
      id,
      recipient,
      other.address,
      PermitAction.MarkDelivered,
      1n,
      "ipfs://delivery-with-amount",
      24n
    );
    await expect(escrow.connect(other).executeActionPermit(deliveryPermit.call)).to.be.revertedWithCustomError(
      escrow,
      "InvalidActionPermit"
    );

    const disputePermit = await signActionPermit(
      id,
      payer,
      other.address,
      PermitAction.MarkDisputed,
      1n,
      "ipfs://dispute-with-amount",
      25n
    );
    await expect(escrow.connect(other).executeActionPermit(disputePermit.call)).to.be.revertedWithCustomError(
      escrow,
      "InvalidActionPermit"
    );
  });

  it("rejects unknown action permit ids", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    const permit = await signActionPermit(id, payer, other.address, 8, 0n, "", 26n);

    await expect(escrow.connect(other).executeActionPermit(permit.call)).to.be.revertedWithCustomError(
      escrow,
      "InvalidActionPermit"
    );
  });

  it("prevents agent mandate overwrite after first attachment", async function () {
    const { id } = await createEthInvoice();

    await escrow
      .connect(creator)
      .attachAgentMandate(id, ZERO_HASH, ZERO_HASH, ethers.id("original mandate"), ZERO_HASH, 0);

    await expect(
      escrow
      .connect(recipient)
      .attachAgentMandate(id, ZERO_HASH, ZERO_HASH, ethers.id("replacement mandate"), ZERO_HASH, 0)
    ).to.be.revertedWithCustomError(escrow, "MandateAlreadyAttached");
  });

  it("requires SLA mandates to be attached before payment with a future deadline", async function () {
    const { id, params } = await createEthInvoice();
    const now = await latestTimestamp();

    await expect(
      escrow
        .connect(creator)
        .attachAgentMandate(id, ZERO_HASH, ZERO_HASH, ethers.id("stale mandate"), ZERO_HASH, now)
    ).to.be.revertedWithCustomError(escrow, "InvalidSlaDeadline");

    await escrow.connect(recipient).postServiceBond(id, ethers.parseEther("0.1"), { value: ethers.parseEther("0.1") });
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    await expect(
      escrow
        .connect(creator)
        .attachAgentMandate(id, ZERO_HASH, ZERO_HASH, ethers.id("post-payment mandate"), ZERO_HASH, now + DAY)
    ).to.be.revertedWithCustomError(escrow, "InvalidState");

    await expect(
      escrow
        .connect(payer)
        .attachAgentMandate(id, ZERO_HASH, ZERO_HASH, ethers.id("payer-post-payment"), ZERO_HASH, 0)
    ).to.be.revertedWithCustomError(escrow, "Unauthorized");
  });

  it("returns posted service bond to recipient on successful release", async function () {
    const { id, params } = await createEthInvoice();
    const bond = ethers.parseEther("0.25");

    await expect(() => escrow.connect(recipient).postServiceBond(id, bond, { value: bond })).to.changeEtherBalances(
      [recipient.address, await escrow.getAddress()],
      [-bond, bond]
    );

    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    await expect(() => escrow.connect(payer).release(id)).to.changeEtherBalances(
      [await escrow.getAddress(), recipient.address],
      [-(params.amount + bond), params.amount + bond]
    );

    const bondContext = await escrow.getBondContext(id);
    expect(bondContext.activeAmount).to.equal(0);
    expect(bondContext.resolvedAmount).to.equal(bond);
    expect(bondContext.resolvedRecipient).to.equal(recipient.address);
    expect(bondContext.slashed).to.equal(false);
  });

  it("slashes service bond to payer when SLA is missed without timely delivery evidence", async function () {
    const { id, params } = await createEthInvoice({ timeout: HOUR });
    const now = await latestTimestamp();
    const bond = ethers.parseEther("0.2");

    await escrow
      .connect(creator)
      .attachAgentMandate(id, ZERO_HASH, ZERO_HASH, ethers.id("sla mandate"), ethers.id("delivery policy"), now + HOUR);
    await escrow.connect(recipient).postServiceBond(id, bond, { value: bond });
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    await increaseTime(HOUR + 1);
    await escrow.connect(payer).requestRefund(id);
    await increaseTime(HOUR + 1);

    await expect(() => escrow.connect(payer).refund(id)).to.changeEtherBalances(
      [await escrow.getAddress(), payer.address],
      [-(params.amount + bond), params.amount + bond]
    );

    const bondContext = await escrow.getBondContext(id);
    expect(bondContext.activeAmount).to.equal(0);
    expect(bondContext.resolvedAmount).to.equal(bond);
    expect(bondContext.resolvedRecipient).to.equal(payer.address);
    expect(bondContext.slashed).to.equal(true);
  });

  it("does not slash service bond when delivery evidence exists", async function () {
    const { id, params } = await createEthInvoice({ timeout: HOUR });
    const now = await latestTimestamp();
    const bond = ethers.parseEther("0.2");

    await escrow
      .connect(creator)
      .attachAgentMandate(id, ZERO_HASH, ZERO_HASH, ethers.id("delivery mandate"), ZERO_HASH, now + HOUR);
    await escrow.connect(recipient).postServiceBond(id, bond, { value: bond });
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(recipient).markDelivered(id, "ipfs://delivery-proof-before-refund");

    await increaseTime(HOUR + 1);
    await escrow.connect(payer).requestRefund(id);
    await increaseTime(HOUR + 1);

    await expect(() => escrow.connect(payer).refund(id)).to.changeEtherBalances(
      [await escrow.getAddress(), payer.address, recipient.address],
      [-(params.amount + bond), params.amount, bond]
    );

    const bondContext = await escrow.getBondContext(id);
    expect(bondContext.resolvedRecipient).to.equal(recipient.address);
    expect(bondContext.slashed).to.equal(false);
  });

  it("slashes service bond when delivery evidence is posted after SLA", async function () {
    const { id, params } = await createEthInvoice({ timeout: HOUR });
    const now = await latestTimestamp();
    const bond = ethers.parseEther("0.2");

    await escrow
      .connect(creator)
      .attachAgentMandate(id, ZERO_HASH, ZERO_HASH, ethers.id("late evidence mandate"), ZERO_HASH, now + HOUR);
    await escrow.connect(recipient).postServiceBond(id, bond, { value: bond });
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    await increaseTime(HOUR + 1);
    await escrow.connect(recipient).markDelivered(id, "ipfs://late-delivery-proof");
    await escrow.connect(payer).requestRefund(id);
    await increaseTime(HOUR + 1);

    await escrow.connect(payer).refund(id);

    const invoice = await escrow.getInvoice(id);
    const bondContext = await escrow.getBondContext(id);
    expect(invoice.deliveryMarkedAt).to.be.gt(invoice.paidAt);
    expect(bondContext.resolvedRecipient).to.equal(payer.address);
    expect(bondContext.slashed).to.equal(true);
  });

  it("validates mandate authorization and required mandate hash", async function () {
    const { id, params } = await createEthInvoice();

    await expect(
      escrow.connect(other).attachAgentMandate(id, ZERO_HASH, ZERO_HASH, ethers.id("mandate"), ZERO_HASH, 0)
    ).to.be.revertedWithCustomError(escrow, "Unauthorized");

    await expect(
      escrow.connect(creator).attachAgentMandate(id, ZERO_HASH, ZERO_HASH, ZERO_HASH, ZERO_HASH, 0)
    ).to.be.revertedWithCustomError(escrow, "InvalidMandate");

    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(payer).release(id);

    await expect(
      escrow.connect(creator).attachAgentMandate(id, ZERO_HASH, ZERO_HASH, ethers.id("too-late"), ZERO_HASH, 0)
    ).to.be.revertedWithCustomError(escrow, "InvalidState");
  });

  it("covers invalid state and unknown invoice guards", async function () {
    const { id, params } = await createEthInvoice();

    await expect(escrow.getInvoice(999)).to.be.revertedWithCustomError(escrow, "InvoiceNotFound");
    await expect(escrow.paymentRequirementHash(999)).to.be.revertedWithCustomError(escrow, "InvoiceNotFound");
    await expect(escrow.connect(recipient).markDelivered(id, "ipfs://too-early")).to.be.revertedWithCustomError(
      escrow,
      "InvalidState"
    );
    await expect(escrow.connect(payer).markDisputed(id, "ipfs://too-early")).to.be.revertedWithCustomError(
      escrow,
      "InvalidState"
    );
    await expect(escrow.connect(payer).cancelSettlementProposal(id)).to.be.revertedWithCustomError(
      escrow,
      "InvalidState"
    );
    await expect(escrow.connect(payer).acceptSettlement(id)).to.be.revertedWithCustomError(escrow, "InvalidState");
    await expect(escrow.connect(payer).requestRefund(id)).to.be.revertedWithCustomError(escrow, "InvalidState");

    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await expect(escrow.connect(other).requestRefund(id)).to.be.revertedWithCustomError(escrow, "Unauthorized");
    await expect(escrow.connect(creator).cancelUnpaid(id)).to.be.revertedWithCustomError(escrow, "InvalidState");
    await expect(escrow.connect(payer).cancelSettlementProposal(id)).to.be.revertedWithCustomError(
      escrow,
      "NoSettlementProposal"
    );
    await expect(escrow.connect(payer).acceptSettlement(id)).to.be.revertedWithCustomError(
      escrow,
      "NoSettlementProposal"
    );
    await expect(escrow.connect(payer).refund(id)).to.be.revertedWithCustomError(escrow, "InvalidState");
    await escrow.connect(payer).proposeSettlement(id, ethers.parseEther("0.8"), "ipfs://unauthorized-accept");
    await expect(escrow.connect(other).acceptSettlement(id)).to.be.revertedWithCustomError(escrow, "Unauthorized");
    await escrow.connect(payer).cancelSettlementProposal(id);
    await escrow.connect(payer).requestRefund(id);
    await expect(escrow.connect(other).refund(id)).to.be.revertedWithCustomError(escrow, "Unauthorized");
  });

  it("covers service bond input guards and ERC20 value rejection", async function () {
    const { id, params } = await createEthInvoice();
    await expect(
      escrow.connect(other).postServiceBond(id, ethers.parseEther("0.1"), { value: ethers.parseEther("0.1") })
    ).to.be.revertedWithCustomError(escrow, "Unauthorized");
    await expect(escrow.connect(recipient).postServiceBond(id, 0)).to.be.revertedWithCustomError(
      escrow,
      "InvalidBondAmount"
    );

    const amount = ethers.parseUnits("10", 18);
    await token.mint(recipient.address, amount);
    const now = await latestTimestamp();
    const tx = await escrow
      .connect(creator)
      .createInvoice(recipient.address, await token.getAddress(), amount, "ipfs://bond-erc20", now + DAY, DAY);
    const receipt = await tx.wait();
    const erc20Id = receipt.logs.find((log) => log.fragment && log.fragment.name === "InvoiceCreated").args.invoiceId;
    await expect(escrow.connect(recipient).postServiceBond(erc20Id, amount, { value: 1 })).to.be.revertedWithCustomError(
      escrow,
      "IncorrectPayment"
    );

    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(payer).release(id);
    await expect(
      escrow.connect(recipient).postServiceBond(id, ethers.parseEther("0.1"), { value: ethers.parseEther("0.1") })
    ).to.be.revertedWithCustomError(escrow, "InvalidState");

    const cancelled = await createEthInvoice();
    await escrow.connect(creator).cancelUnpaid(cancelled.id);
    await expect(
      escrow.connect(recipient).postServiceBond(cancelled.id, ethers.parseEther("0.1"), { value: ethers.parseEther("0.1") })
    ).to.be.revertedWithCustomError(escrow, "InvalidState");

    const settled = await createEthInvoice();
    await escrow.connect(payer).payInvoice(settled.id, { value: settled.params.amount });
    await escrow.connect(payer).proposeSettlement(settled.id, ethers.parseEther("0.5"), "ipfs://settled-final");
    await escrow.connect(recipient).acceptSettlement(settled.id);
    await expect(
      escrow.connect(recipient).postServiceBond(settled.id, ethers.parseEther("0.1"), { value: ethers.parseEther("0.1") })
    ).to.be.revertedWithCustomError(escrow, "InvalidState");

    const refunded = await createEthInvoice({ timeout: HOUR });
    await escrow.connect(payer).payInvoice(refunded.id, { value: refunded.params.amount });
    await escrow.connect(payer).requestRefund(refunded.id);
    await escrow.connect(recipient).refund(refunded.id);
    await expect(
      escrow.connect(recipient).postServiceBond(refunded.id, ethers.parseEther("0.1"), { value: ethers.parseEther("0.1") })
    ).to.be.revertedWithCustomError(escrow, "InvalidState");

    const refundRequested = await createEthInvoice({ timeout: HOUR });
    await escrow.connect(payer).payInvoice(refundRequested.id, { value: refundRequested.params.amount });
    await escrow.connect(payer).requestRefund(refundRequested.id);
    await expect(
      escrow
        .connect(recipient)
        .postServiceBond(refundRequested.id, ethers.parseEther("0.1"), { value: ethers.parseEther("0.1") })
    ).to.be.revertedWithCustomError(escrow, "InvalidState");

    const wrongValue = await createEthInvoice();
    await expect(
      escrow.connect(recipient).postServiceBond(wrongValue.id, ethers.parseEther("0.1"), { value: ethers.parseEther("0.2") })
    ).to.be.revertedWithCustomError(escrow, "IncorrectPayment");

    await expect(escrow.connect(recipient).withdraw(ZERO_ADDRESS)).to.be.revertedWithCustomError(
      escrow,
      "NothingToWithdraw"
    );
  });

  it("pays invoices without due dates", async function () {
    const { id, params } = await createEthInvoice({ dueAt: 0 });
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    expect((await escrow.getInvoice(id)).state).to.equal(1);
  });

  it("rejects wrong ETH payment amount and double payment", async function () {
    const { id, params } = await createEthInvoice();

    await expect(escrow.connect(payer).payInvoice(id, { value: params.amount - 1n })).to.be.revertedWithCustomError(
      escrow,
      "IncorrectPayment"
    );

    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await expect(escrow.connect(other).payInvoice(id, { value: params.amount })).to.be.revertedWithCustomError(
      escrow,
      "InvalidState"
    );
  });

  it("rejects payments after due date", async function () {
    const now = await latestTimestamp();
    const { id, params } = await createEthInvoice({ dueAt: now + HOUR });

    await increaseTime(HOUR + 1);
    await expect(escrow.connect(payer).payInvoice(id, { value: params.amount })).to.be.revertedWithCustomError(
      escrow,
      "InvoicePastDue"
    );
  });

  it("allows payer to release funds to recipient", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    await expect(() => escrow.connect(payer).release(id)).to.changeEtherBalances(
      [await escrow.getAddress(), recipient.address],
      [-params.amount, params.amount]
    );

    const invoice = await escrow.getInvoice(id);
    expect(invoice.state).to.equal(3);
  });

  it("credits release payout when recipient rejects ETH transfers", async function () {
    const RejectETH = await ethers.getContractFactory("MockRejectETH");
    const rejectingRecipient = await RejectETH.deploy();
    const rejectingRecipientAddress = await rejectingRecipient.getAddress();
    const { id, params } = await createEthInvoice({ recipient: rejectingRecipientAddress });
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    await expect(escrow.connect(payer).release(id))
      .to.emit(escrow, "PayoutCredited")
      .withArgs(rejectingRecipientAddress, ZERO_ADDRESS, params.amount);

    expect((await escrow.getInvoice(id)).state).to.equal(3);
    expect(await escrow.withdrawable(rejectingRecipientAddress, ZERO_ADDRESS)).to.equal(params.amount);
    await expect(rejectingRecipient.withdrawPending(await escrow.getAddress(), ZERO_ADDRESS)).to.be.revertedWith(
      "ETH_TRANSFER_FAILED"
    );
    expect(await escrow.withdrawable(rejectingRecipientAddress, ZERO_ADDRESS)).to.equal(params.amount);
  });

  it("does not let a reverting bonded recipient lock payer timeout refunds", async function () {
    const BondingRejectETH = await ethers.getContractFactory("MockBondingRejectETH");
    const rejectingRecipient = await BondingRejectETH.deploy();
    const rejectingRecipientAddress = await rejectingRecipient.getAddress();
    const { id, params } = await createEthInvoice({ recipient: rejectingRecipientAddress, timeout: HOUR });
    const bond = ethers.parseEther("0.1");

    await rejectingRecipient.postBond(await escrow.getAddress(), id, { value: bond });
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(payer).requestRefund(id);
    await increaseTime(HOUR + 1);

    await expect(() => escrow.connect(payer).refund(id)).to.changeEtherBalances(
      [await escrow.getAddress(), payer.address],
      [-params.amount, params.amount]
    );

    const invoice = await escrow.getInvoice(id);
    const bondContext = await escrow.getBondContext(id);
    expect(invoice.state).to.equal(4);
    expect(bondContext.resolvedRecipient).to.equal(rejectingRecipientAddress);
    expect(bondContext.slashed).to.equal(false);
    expect(await escrow.withdrawable(rejectingRecipientAddress, ZERO_ADDRESS)).to.equal(bond);

    const escrowAddress = await escrow.getAddress();
    await expect(() => rejectingRecipient.withdrawPending(escrowAddress, ZERO_ADDRESS)).to.changeEtherBalances(
      [rejectingRecipientAddress, escrowAddress],
      [bond, -bond]
    );
    expect(await escrow.withdrawable(rejectingRecipientAddress, ZERO_ADDRESS)).to.equal(0);
  });

  it("emits a portable settlement receipt when funds are released", async function () {
    const { id, params } = await createEthInvoice();
    await escrow
      .connect(creator)
      .attachAgentMandate(
        id,
        ethers.id("payer-agent"),
        ethers.id("recipient-agent"),
        ethers.id("signed mandate"),
        ethers.id("agent policy"),
        (await latestTimestamp()) + DAY
      );
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    const tx = await escrow.connect(payer).release(id);
    const receipt = await tx.wait();
    const receiptEvent = receipt.logs.find((log) => log.fragment && log.fragment.name === "SettlementReceiptFinalized");

    expect(receiptEvent.args.invoiceId).to.equal(id);
    expect(receiptEvent.args.finalState).to.equal(3);
    expect(receiptEvent.args.receiptHash).to.equal(await escrow.settlementReceiptHash(id));
  });

  it("accepts post-settlement agent feedback bound to the receipt hash", async function () {
    const { id, params } = await createEthInvoice();
    const payerAgentHash = ethers.id("payer-agent-feedback");
    const recipientAgentHash = ethers.id("recipient-agent-feedback");

    await escrow
      .connect(creator)
      .attachAgentMandate(
        id,
        payerAgentHash,
        recipientAgentHash,
        ethers.id("feedback mandate"),
        ethers.id("feedback policy"),
        (await latestTimestamp()) + DAY
      );
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(payer).release(id);

    const emptySummary = await escrow.getAgentReputationSummary(ethers.id("unknown-agent"));
    expect(emptySummary.count).to.equal(0);
    expect(emptySummary.summaryValue).to.equal(0);
    expect(emptySummary.valueDecimals).to.equal(0);

    const receiptHash = await escrow.settlementReceiptHash(id);
    const feedbackTx = await escrow
      .connect(payer)
      .submitAgentFeedback(
        id,
        true,
        88,
        "delivery",
        "on-time",
        "ipfs://payer-feedback",
        ethers.id("payer feedback payload")
      );
    const feedbackReceipt = await feedbackTx.wait();
    const feedbackEvent = feedbackReceipt.logs.find((log) => log.fragment && log.fragment.name === "AgentFeedbackSubmitted");
    const erc8004FeedbackEvent = feedbackReceipt.logs.find(
      (log) => log.fragment && log.fragment.name === "ERC8004FeedbackRecorded"
    );
    const reputationEvent = feedbackReceipt.logs.find((log) => log.fragment && log.fragment.name === "AgentReputationUpdated");

    const first = await escrow.getFeedbackContext(id);
    const reputation = await escrow.getAgentReputation(recipientAgentHash);
    const reputationSummary = await escrow.getAgentReputationSummary(recipientAgentHash);
    expect(first.count).to.equal(1);
    expect(first.root).to.not.equal(ZERO_HASH);
    expect(reputation.feedbackCount).to.equal(1);
    expect(reputation.feedbackScoreSum).to.equal(88);
    expect(reputation.validationCount).to.equal(0);
    expect(reputation.rollingRoot).to.not.equal(ZERO_HASH);
    expect(reputationSummary.count).to.equal(1);
    expect(reputationSummary.summaryValue).to.equal(88);
    expect(reputationSummary.valueDecimals).to.equal(0);
    const erc8004Summary = await escrow.getSummary(recipientAgentHash);
    expect(erc8004Summary.count).to.equal(1);
    expect(erc8004Summary.summaryValue).to.equal(88);
    expect(erc8004Summary.summaryValueDecimals).to.equal(0);
    expect(reputationEvent.args.agentHash).to.equal(recipientAgentHash);
    expect(reputationEvent.args.feedbackCount).to.equal(1);
    expect(reputationEvent.args.feedbackScoreSum).to.equal(88);
    expect(feedbackEvent.args.invoiceId).to.equal(id);
    expect(feedbackEvent.args.reviewer).to.equal(payer.address);
    expect(feedbackEvent.args.agentHash).to.equal(recipientAgentHash);
    expect(feedbackEvent.args.recipientAgent).to.equal(true);
    expect(feedbackEvent.args.score).to.equal(88);
    expect(feedbackEvent.args.receiptHash).to.equal(receiptHash);
    expect(feedbackEvent.args.feedbackCount).to.equal(1);
    expect(feedbackEvent.args.feedbackRoot).to.equal(first.root);
    expect(erc8004FeedbackEvent.args.agentHash).to.equal(recipientAgentHash);
    expect(erc8004FeedbackEvent.args.feedbackCount).to.equal(1);
    expect(erc8004FeedbackEvent.args.score).to.equal(88);
    expect(erc8004FeedbackEvent.args.tag1).to.equal("delivery");
    expect(erc8004FeedbackEvent.args.tag2).to.equal("on-time");
    expect(erc8004FeedbackEvent.args.feedbackURI).to.equal("ipfs://payer-feedback");
    expect(erc8004FeedbackEvent.args.feedbackHash).to.equal(ethers.id("payer feedback payload"));

    await escrow
      .connect(recipient)
      .submitAgentFeedback(id, false, 75, "payment", "clear", "ipfs://recipient-feedback", ethers.id("recipient feedback payload"));

    const second = await escrow.getFeedbackContext(id);
    expect(second.count).to.equal(2);
    expect(second.root).to.not.equal(first.root);
  });

  it("accepts agent feedback across refunded, cancelled, and settled final states", async function () {
    const recipientAgentHash = ethers.id("recipient-agent-final-feedback");

    const refunded = await createEthInvoice();
    await escrow
      .connect(creator)
      .attachAgentMandate(
        refunded.id,
        ethers.id("payer-agent-refunded-feedback"),
        recipientAgentHash,
        ethers.id("refunded feedback mandate"),
        ZERO_HASH,
        0
      );
    await escrow.connect(payer).payInvoice(refunded.id, { value: refunded.params.amount });
    await escrow.connect(payer).requestRefund(refunded.id);
    await escrow.connect(recipient).refund(refunded.id);
    await escrow
      .connect(payer)
      .submitAgentFeedback(refunded.id, true, 10, "refund", "cooperative", "ipfs://refunded-feedback", ZERO_HASH);
    expect((await escrow.getFeedbackContext(refunded.id)).count).to.equal(1);

    const cancelled = await createEthInvoice();
    await escrow
      .connect(creator)
      .attachAgentMandate(
        cancelled.id,
        ethers.id("payer-agent-cancelled-feedback"),
        recipientAgentHash,
        ethers.id("cancelled feedback mandate"),
        ZERO_HASH,
        0
      );
    await escrow.connect(creator).cancelUnpaid(cancelled.id);
    await escrow
      .connect(recipient)
      .submitAgentFeedback(cancelled.id, false, 0, "cancelled", "unpaid", "ipfs://cancelled-feedback", ZERO_HASH);
    expect((await escrow.getFeedbackContext(cancelled.id)).count).to.equal(1);

    const settled = await createEthInvoice();
    await escrow
      .connect(creator)
      .attachAgentMandate(
        settled.id,
        ethers.id("payer-agent-settled-feedback"),
        recipientAgentHash,
        ethers.id("settled feedback mandate"),
        ZERO_HASH,
        0
      );
    await escrow.connect(payer).payInvoice(settled.id, { value: settled.params.amount });
    await escrow.connect(payer).proposeSettlement(settled.id, ethers.parseEther("0.6"), "ipfs://settled-feedback");
    await escrow.connect(recipient).acceptSettlement(settled.id);
    await escrow
      .connect(payer)
      .submitAgentFeedback(settled.id, true, 30, "settled", "split", "ipfs://settled-feedback", ZERO_HASH);
    expect((await escrow.getFeedbackContext(settled.id)).count).to.equal(1);
  });

  it("restricts agent feedback to settled counterparties and valid scores", async function () {
    const { id, params } = await createEthInvoice();
    await escrow
      .connect(creator)
      .attachAgentMandate(
        id,
        ethers.id("payer-agent-feedback-restrictions"),
        ethers.id("recipient-agent-feedback-restrictions"),
        ethers.id("feedback restrictions mandate"),
        ZERO_HASH,
        0
      );

    await expect(
      escrow.connect(payer).submitAgentFeedback(id, true, 50, "early", "", "ipfs://early", ZERO_HASH)
    ).to.be.revertedWithCustomError(escrow, "InvalidState");

    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(payer).release(id);

    await expect(
      escrow.connect(other).submitAgentFeedback(id, true, 50, "bad", "", "ipfs://bad", ZERO_HASH)
    ).to.be.revertedWithCustomError(escrow, "Unauthorized");

    await expect(
      escrow.connect(payer).submitAgentFeedback(id, true, 101, "too-high", "", "ipfs://bad", ZERO_HASH)
    ).to.be.revertedWithCustomError(escrow, "InvalidFeedback");

    await expect(
      escrow.connect(payer).submitAgentFeedback(id, true, -101, "too-low", "", "ipfs://bad", ZERO_HASH)
    ).to.be.revertedWithCustomError(escrow, "InvalidFeedback");

    await expect(
      escrow.connect(payer).submitAgentFeedback(id, false, 50, "wrong-side", "", "ipfs://bad", ZERO_HASH)
    ).to.be.revertedWithCustomError(escrow, "Unauthorized");

    const zeroPayerAgent = await createEthInvoice();
    await escrow
      .connect(creator)
      .attachAgentMandate(
        zeroPayerAgent.id,
        ZERO_HASH,
        ethers.id("recipient-agent-only"),
        ethers.id("recipient-only feedback mandate"),
        ZERO_HASH,
        0
      );
    await escrow.connect(payer).payInvoice(zeroPayerAgent.id, { value: zeroPayerAgent.params.amount });
    await escrow.connect(payer).release(zeroPayerAgent.id);
    await expect(
      escrow.connect(recipient).submitAgentFeedback(zeroPayerAgent.id, false, 50, "missing-agent", "", "ipfs://bad", ZERO_HASH)
    ).to.be.revertedWithCustomError(escrow, "InvalidFeedback");
  });

  it("accepts receipt-bound validator attestations for attached agents", async function () {
    const { id, params } = await createEthInvoice();
    const payerAgentHash = ethers.id("payer-agent-validation");
    const recipientAgentHash = ethers.id("recipient-agent-validation");

    await escrow
      .connect(creator)
      .attachAgentMandate(
        id,
        payerAgentHash,
        recipientAgentHash,
        ethers.id("validation mandate"),
        ethers.id("validation policy"),
        (await latestTimestamp()) + DAY
      );
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(payer).release(id);

    const signed = await signValidationAttestation(id, other, recipientAgentHash, {
      teeAttestationHash: ethers.id("tee:validator enclave quote"),
      nonce: 21n
    });
    expect(await escrow.validationAttestationDigest(signed.call)).to.not.equal(ZERO_HASH);
    const validationTx = await escrow.connect(creator).submitAgentValidation(signed.call);
    const validationReceipt = await validationTx.wait();
    const validationEvent = validationReceipt.logs.find(
      (log) => log.fragment && log.fragment.name === "AgentValidationSubmitted"
    );
    const erc8004ValidationEvent = validationReceipt.logs.find(
      (log) => log.fragment && log.fragment.name === "ERC8004ValidationRecorded"
    );

    const context = await escrow.getValidationContext(id);
    const reputation = await escrow.getAgentReputation(recipientAgentHash);
    const reputationSummary = await escrow.getAgentReputationSummary(recipientAgentHash);
    expect(context.count).to.equal(1);
    expect(context.root).to.not.equal(ZERO_HASH);
    expect(reputation.feedbackCount).to.equal(0);
    expect(reputation.validationCount).to.equal(1);
    expect(reputation.validationScoreSum).to.equal(92);
    expect(reputation.approvedValidationCount).to.equal(1);
    expect(reputation.rollingRoot).to.not.equal(ZERO_HASH);
    expect(reputationSummary.count).to.equal(1);
    expect(reputationSummary.summaryValue).to.equal(92);
    expect(await escrow.usedValidationNonces(other.address, 21n)).to.equal(true);
    expect(validationEvent.args.invoiceId).to.equal(id);
    expect(validationEvent.args.validator).to.equal(other.address);
    expect(validationEvent.args.subjectAgentHash).to.equal(recipientAgentHash);
    expect(validationEvent.args.validatorAgentHash).to.equal(signed.validatorAgentHash);
    expect(validationEvent.args.approved).to.equal(true);
    expect(validationEvent.args.score).to.equal(92);
    expect(validationEvent.args.schemaHash).to.equal(signed.schemaHash);
    expect(validationEvent.args.evidenceURI).to.equal(signed.evidenceURI);
    expect(validationEvent.args.evidenceHash).to.equal(signed.evidenceHash);
    expect(validationEvent.args.teeAttestationHash).to.equal(signed.teeAttestationHash);
    expect(validationEvent.args.receiptHash).to.equal(signed.receiptHash);
    expect(validationEvent.args.validationCount).to.equal(1);
    expect(validationEvent.args.validationRoot).to.equal(context.root);
    const expectedValidationRequestHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bytes32", "bytes32", "bytes32"],
        [id, signed.receiptHash, signed.schemaHash, ethers.id(signed.evidenceURI)]
      )
    );
    expect(erc8004ValidationEvent.args.subjectAgentHash).to.equal(recipientAgentHash);
    expect(erc8004ValidationEvent.args.validator).to.equal(other.address);
    expect(erc8004ValidationEvent.args.requestHash).to.equal(expectedValidationRequestHash);
    expect(erc8004ValidationEvent.args.approved).to.equal(true);
    expect(erc8004ValidationEvent.args.score).to.equal(92);
    expect(erc8004ValidationEvent.args.responseURI).to.equal(signed.evidenceURI);
    expect(erc8004ValidationEvent.args.responseHash).to.equal(signed.evidenceHash);
    expect(erc8004ValidationEvent.args.tag).to.equal("approved");

    await expect(escrow.connect(creator).submitAgentValidation(signed.call)).to.be.revertedWithCustomError(
      escrow,
      "ValidationAttestationUsed"
    );

    const payerValidation = await signValidationAttestation(id, other, payerAgentHash, {
      approved: false,
      score: -12,
      nonce: 22n
    });
    await escrow.connect(recipient).submitAgentValidation(payerValidation.call);
    const second = await escrow.getValidationContext(id);
    const payerReputation = await escrow.getAgentReputation(payerAgentHash);
    const payerSummary = await escrow.getAgentReputationSummary(payerAgentHash);
    expect(second.count).to.equal(2);
    expect(payerReputation.validationCount).to.equal(1);
    expect(payerReputation.validationScoreSum).to.equal(-12);
    expect(payerReputation.approvedValidationCount).to.equal(0);
    expect(payerSummary.summaryValue).to.equal(-12);
  });

  it("lets validators cancel attestation nonces before submission", async function () {
    const { id, params } = await createEthInvoice();
    const recipientAgentHash = ethers.id("recipient-agent-validation-cancel");
    await escrow
      .connect(creator)
      .attachAgentMandate(
        id,
        ethers.id("payer-agent-validation-cancel"),
        recipientAgentHash,
        ethers.id("validation cancel mandate"),
        ZERO_HASH,
        0
      );
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(payer).release(id);

    const signed = await signValidationAttestation(id, other, recipientAgentHash, { nonce: 88n });
    await expect(escrow.connect(other).cancelValidationNonce(88n))
      .to.emit(escrow, "ValidationNonceCancelled")
      .withArgs(other.address, 88n);
    expect(await escrow.usedValidationNonces(other.address, 88n)).to.equal(true);

    await expect(escrow.connect(other).cancelValidationNonce(88n)).to.be.revertedWithCustomError(
      escrow,
      "ValidationAttestationUsed"
    );
    await expect(escrow.connect(creator).submitAgentValidation(signed.call)).to.be.revertedWithCustomError(
      escrow,
      "ValidationAttestationUsed"
    );
    expect((await escrow.getValidationContext(id)).count).to.equal(0);
  });

  it("rejects invalid validator attestations before they alter validation roots", async function () {
    const { id, params } = await createEthInvoice({ timeout: HOUR });
    const payerAgentHash = ethers.id("payer-agent-validation-reject");
    const recipientAgentHash = ethers.id("recipient-agent-validation-reject");

    await escrow
      .connect(creator)
      .attachAgentMandate(id, payerAgentHash, recipientAgentHash, ethers.id("validation reject mandate"), ZERO_HASH, 0);

    const early = await signValidationAttestation(id, other, recipientAgentHash, { nonce: 31n });
    await expect(escrow.connect(creator).submitAgentValidation(early.call)).to.be.revertedWithCustomError(
      escrow,
      "InvalidState"
    );

    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(payer).release(id);

    const zeroValidator = await signValidationAttestation(id, other, recipientAgentHash, { nonce: 30n });
    await expect(
      escrow.connect(creator).submitAgentValidation({ ...zeroValidator.call, validator: ZERO_ADDRESS })
    ).to.be.revertedWithCustomError(escrow, "InvalidValidation");

    await expect(
      escrow.connect(creator).submitAgentValidation({ ...zeroValidator.call, validatorAgentHash: ZERO_HASH })
    ).to.be.revertedWithCustomError(escrow, "InvalidValidation");

    await expect(
      escrow.connect(creator).submitAgentValidation({ ...zeroValidator.call, score: -101 })
    ).to.be.revertedWithCustomError(escrow, "InvalidValidation");

    const expired = await signValidationAttestation(id, other, recipientAgentHash, {
      expiresAt: await latestTimestamp(),
      nonce: 32n
    });
    await expect(escrow.connect(creator).submitAgentValidation(expired.call)).to.be.revertedWithCustomError(
      escrow,
      "ValidationAttestationExpired"
    );

    const wrongSubject = await signValidationAttestation(id, other, ethers.id("unknown-agent"), { nonce: 33n });
    await expect(escrow.connect(creator).submitAgentValidation(wrongSubject.call)).to.be.revertedWithCustomError(
      escrow,
      "InvalidValidation"
    );

    const zeroSubject = await signValidationAttestation(id, other, ZERO_HASH, { nonce: 35n });
    await expect(escrow.connect(creator).submitAgentValidation(zeroSubject.call)).to.be.revertedWithCustomError(
      escrow,
      "InvalidValidation"
    );

    const signed = await signValidationAttestation(id, other, recipientAgentHash, { nonce: 34n });
    const tampered = { ...signed.call, score: 91 };
    await expect(escrow.connect(creator).submitAgentValidation(tampered)).to.be.revertedWithCustomError(
      escrow,
      "InvalidSignature"
    );

    await expect(
      escrow.connect(creator).submitAgentValidation({ ...signed.call, score: 101 })
    ).to.be.revertedWithCustomError(escrow, "InvalidValidation");

    const context = await escrow.getValidationContext(id);
    expect(context.count).to.equal(0);
    expect(context.root).to.equal(ZERO_HASH);
    expect(await escrow.usedValidationNonces(other.address, 34n)).to.equal(false);
  });

  it("prevents wrong caller release before timeout and double release", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    await expect(escrow.connect(other).release(id)).to.be.revertedWithCustomError(escrow, "Unauthorized");
    await expect(escrow.connect(recipient).release(id)).to.be.revertedWithCustomError(escrow, "Unauthorized");

    await escrow.connect(payer).release(id);
    await expect(escrow.connect(payer).release(id)).to.be.revertedWithCustomError(escrow, "InvalidState");
  });

  it("allows recipient timeout release when payer is inactive", async function () {
    const { id, params } = await createEthInvoice({ timeout: HOUR });
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    await increaseTime(HOUR + 1);
    await escrow.connect(recipient).release(id);

    const invoice = await escrow.getInvoice(id);
    expect(invoice.state).to.equal(3);
  });

  it("allows no-SLA recipient timeout release with delivery evidence", async function () {
    const { id, params } = await createEthInvoice({ timeout: HOUR });
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(recipient).markDelivered(id, "ipfs://no-sla-delivery");

    await increaseTime(HOUR + 1);
    await escrow.connect(recipient).release(id);

    const invoice = await escrow.getInvoice(id);
    expect(invoice.state).to.equal(3);
  });

  it("blocks recipient timeout release when SLA requires timely delivery evidence", async function () {
    const { id, params } = await createEthInvoice({ timeout: HOUR });
    const now = await latestTimestamp();

    await escrow
      .connect(creator)
      .attachAgentMandate(id, ZERO_HASH, ZERO_HASH, ethers.id("timely release mandate"), ZERO_HASH, now + HOUR);
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    await increaseTime(HOUR + 1);
    await expect(escrow.connect(recipient).release(id)).to.be.revertedWithCustomError(escrow, "Unauthorized");
  });

  it("allows recipient timeout release when delivery evidence was posted before SLA", async function () {
    const { id, params } = await createEthInvoice({ timeout: HOUR });
    const now = await latestTimestamp();

    await escrow
      .connect(creator)
      .attachAgentMandate(id, ZERO_HASH, ZERO_HASH, ethers.id("timely evidence mandate"), ZERO_HASH, now + HOUR);
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(recipient).markDelivered(id, "ipfs://timely-delivery-proof");

    await increaseTime(HOUR + 1);
    await escrow.connect(recipient).release(id);

    const invoice = await escrow.getInvoice(id);
    expect(invoice.state).to.equal(3);
  });

  it("supports refund request and recipient-approved refund", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(payer).requestRefund(id);

    await expect(() => escrow.connect(recipient).refund(id)).to.changeEtherBalances(
      [await escrow.getAddress(), payer.address],
      [-params.amount, params.amount]
    );

    const invoice = await escrow.getInvoice(id);
    expect(invoice.state).to.equal(4);
  });

  it("lets recipient attach delivery evidence while funds are escrowed", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    await expect(escrow.connect(other).markDelivered(id, "ipfs://delivery-proof")).to.be.revertedWithCustomError(
      escrow,
      "Unauthorized"
    );

    await expect(escrow.connect(recipient).markDelivered(id, "ipfs://delivery-proof"))
      .to.emit(escrow, "DeliveryMarked")
      .withArgs(id, recipient.address, "ipfs://delivery-proof");

    const invoice = await escrow.getInvoice(id);
    expect(invoice.deliveryHash).to.equal("ipfs://delivery-proof");
    expect(invoice.deliveryEvidenceCount).to.equal(1);
    expect(invoice.deliveryEvidenceRoot).to.not.equal(ZERO_HASH);
  });

  it("appends delivery evidence without overwriting first SLA timestamp", async function () {
    const { id, params } = await createEthInvoice({ timeout: HOUR });
    const now = await latestTimestamp();

    await escrow
      .connect(creator)
      .attachAgentMandate(id, ZERO_HASH, ZERO_HASH, ethers.id("append delivery mandate"), ZERO_HASH, now + HOUR);
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(recipient).markDelivered(id, "ipfs://first-delivery-proof");

    const first = await escrow.getInvoice(id);
    await increaseTime(HOUR + 1);
    await escrow.connect(recipient).markDelivered(id, "ipfs://supplemental-delivery-proof");

    const second = await escrow.getInvoice(id);
    expect(second.deliveryHash).to.equal("ipfs://first-delivery-proof");
    expect(second.deliveryMarkedAt).to.equal(first.deliveryMarkedAt);
    expect(second.deliveryEvidenceCount).to.equal(2);
    expect(second.deliveryEvidenceRoot).to.not.equal(first.deliveryEvidenceRoot);
  });

  it("lets recipient attach delivery evidence after refund request", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(payer).requestRefund(id);

    await escrow.connect(recipient).markDelivered(id, "ipfs://late-delivery-proof");

    const invoice = await escrow.getInvoice(id);
    expect(invoice.deliveryHash).to.equal("ipfs://late-delivery-proof");
  });

  it("lets payer attach dispute evidence while funds are escrowed or refund requested", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    await expect(escrow.connect(other).markDisputed(id, "ipfs://bad-dispute")).to.be.revertedWithCustomError(
      escrow,
      "Unauthorized"
    );

    await expect(escrow.connect(payer).markDisputed(id, "ipfs://initial-dispute-proof"))
      .to.emit(escrow, "DisputeMarked")
      .withArgs(id, payer.address, "ipfs://initial-dispute-proof");

    const first = await escrow.getInvoice(id);
    expect(first.disputeHash).to.equal("ipfs://initial-dispute-proof");
    expect(first.disputeEvidenceCount).to.equal(1);
    expect(first.disputeEvidenceRoot).to.not.equal(ZERO_HASH);

    await escrow.connect(payer).requestRefund(id);
    await escrow.connect(payer).markDisputed(id, "ipfs://supplemental-dispute-proof");

    const second = await escrow.getInvoice(id);
    expect(second.disputeHash).to.equal("ipfs://initial-dispute-proof");
    expect(second.disputeMarkedAt).to.equal(first.disputeMarkedAt);
    expect(second.disputeEvidenceCount).to.equal(2);
    expect(second.disputeEvidenceRoot).to.not.equal(first.disputeEvidenceRoot);
  });

  it("rejects empty delivery and dispute evidence", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    await expect(escrow.connect(recipient).markDelivered(id, "")).to.be.revertedWithCustomError(
      escrow,
      "InvalidEvidence"
    );
    await expect(escrow.connect(payer).markDisputed(id, "")).to.be.revertedWithCustomError(
      escrow,
      "InvalidEvidence"
    );
  });

  it("prevents timeout refund before waiting period", async function () {
    const { id, params } = await createEthInvoice({ timeout: HOUR });
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(payer).requestRefund(id);

    await expect(escrow.connect(payer).refund(id)).to.be.revertedWithCustomError(escrow, "RefundTimeoutNotReached");
  });

  it("allows payer timeout refund after refund request timeout", async function () {
    const { id, params } = await createEthInvoice({ timeout: HOUR });
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(payer).requestRefund(id);

    await increaseTime(HOUR + 1);
    await expect(() => escrow.connect(payer).refund(id)).to.changeEtherBalances(
      [await escrow.getAddress(), payer.address],
      [-params.amount, params.amount]
    );

    const invoice = await escrow.getInvoice(id);
    expect(invoice.state).to.equal(4);
  });

  it("supports negotiated ETH settlement with partial recipient payout", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    const recipientAmount = ethers.parseEther("0.7");
    const payerAmount = params.amount - recipientAmount;

    await expect(escrow.connect(payer).proposeSettlement(id, recipientAmount, "ipfs://settlement-70-30"))
      .to.emit(escrow, "SettlementProposed")
      .withArgs(id, payer.address, recipientAmount, payerAmount, "ipfs://settlement-70-30");

    let invoice = await escrow.getInvoice(id);
    expect(invoice.settlementProposedBy).to.equal(payer.address);
    expect(invoice.settlementRecipientAmount).to.equal(recipientAmount);
    expect(invoice.settlementMemoHash).to.equal("ipfs://settlement-70-30");

    await expect(() => escrow.connect(recipient).acceptSettlement(id)).to.changeEtherBalances(
      [await escrow.getAddress(), recipient.address, payer.address],
      [-params.amount, recipientAmount, payerAmount]
    );

    invoice = await escrow.getInvoice(id);
    expect(invoice.state).to.equal(6);
  });

  it("supports negotiated ETH settlement with zero and full recipient payout", async function () {
    const zeroSplit = await createEthInvoice();
    await escrow.connect(payer).payInvoice(zeroSplit.id, { value: zeroSplit.params.amount });
    await escrow.connect(payer).proposeSettlement(zeroSplit.id, 0, "ipfs://zero-recipient");
    await escrow.connect(recipient).acceptSettlement(zeroSplit.id);
    expect((await escrow.getInvoice(zeroSplit.id)).state).to.equal(6);

    const fullSplit = await createEthInvoice();
    await escrow.connect(payer).payInvoice(fullSplit.id, { value: fullSplit.params.amount });
    await escrow.connect(payer).proposeSettlement(fullSplit.id, fullSplit.params.amount, "ipfs://full-recipient");
    await escrow.connect(recipient).acceptSettlement(fullSplit.id);
    expect((await escrow.getInvoice(fullSplit.id)).state).to.equal(6);
  });

  it("prevents proposer from accepting their own settlement proposal", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(recipient).proposeSettlement(id, ethers.parseEther("0.8"), "ipfs://recipient-proposal");

    await expect(escrow.connect(recipient).acceptSettlement(id)).to.be.revertedWithCustomError(escrow, "Unauthorized");
    await escrow.connect(payer).acceptSettlement(id);

    const invoice = await escrow.getInvoice(id);
    expect(invoice.state).to.equal(6);
  });

  it("lets settlement proposer cancel a stale proposal", async function () {
    const { id, params } = await createEthInvoice();
    await escrow.connect(payer).payInvoice(id, { value: params.amount });
    await escrow.connect(payer).proposeSettlement(id, ethers.parseEther("0.8"), "ipfs://payer-proposal");

    await expect(escrow.connect(recipient).cancelSettlementProposal(id)).to.be.revertedWithCustomError(
      escrow,
      "Unauthorized"
    );
    await expect(escrow.connect(payer).cancelSettlementProposal(id))
      .to.emit(escrow, "SettlementProposalCancelled")
      .withArgs(id, payer.address);

    const invoice = await escrow.getInvoice(id);
    expect(invoice.settlementProposedBy).to.equal(ZERO_ADDRESS);
    expect(invoice.settlementRecipientAmount).to.equal(0);
    expect(invoice.settlementMemoHash).to.equal("");
    await expect(escrow.connect(recipient).acceptSettlement(id)).to.be.revertedWithCustomError(
      escrow,
      "NoSettlementProposal"
    );
  });

  it("validates settlement proposal state, caller, and amount", async function () {
    const { id, params } = await createEthInvoice();

    await expect(
      escrow.connect(payer).proposeSettlement(id, params.amount, "ipfs://too-early")
    ).to.be.revertedWithCustomError(escrow, "InvalidState");

    await escrow.connect(payer).payInvoice(id, { value: params.amount });

    await expect(
      escrow.connect(other).proposeSettlement(id, params.amount, "ipfs://bad-caller")
    ).to.be.revertedWithCustomError(escrow, "Unauthorized");

    await expect(
      escrow.connect(payer).proposeSettlement(id, params.amount + 1n, "ipfs://too-large")
    ).to.be.revertedWithCustomError(escrow, "InvalidSettlementAmount");

    await expect(escrow.connect(payer).acceptSettlement(id)).to.be.revertedWithCustomError(
      escrow,
      "NoSettlementProposal"
    );
  });

  it("handles ERC20 pay and release path", async function () {
    const amount = ethers.parseUnits("250", 18);
    await token.mint(payer.address, amount);

    const now = await latestTimestamp();
    const tx = await escrow
      .connect(creator)
      .createInvoice(recipient.address, await token.getAddress(), amount, "ipfs://erc20-invoice", now + DAY, DAY);
    const receipt = await tx.wait();
    const id = receipt.logs.find((log) => log.fragment && log.fragment.name === "InvoiceCreated").args.invoiceId;

    await token.connect(payer).approve(await escrow.getAddress(), amount);
    await escrow.connect(payer).payInvoice(id);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(amount);

    await escrow.connect(payer).release(id);
    expect(await token.balanceOf(recipient.address)).to.equal(amount);
  });

  it("handles ERC20 negotiated settlement split", async function () {
    const amount = ethers.parseUnits("300", 18);
    await token.mint(payer.address, amount);

    const now = await latestTimestamp();
    const tx = await escrow
      .connect(creator)
      .createInvoice(recipient.address, await token.getAddress(), amount, "ipfs://erc20-settlement", now + DAY, DAY);
    const receipt = await tx.wait();
    const id = receipt.logs.find((log) => log.fragment && log.fragment.name === "InvoiceCreated").args.invoiceId;

    await token.connect(payer).approve(await escrow.getAddress(), amount);
    await escrow.connect(payer).payInvoice(id);

    const recipientAmount = ethers.parseUnits("225", 18);
    const payerAmount = amount - recipientAmount;
    await escrow.connect(recipient).proposeSettlement(id, recipientAmount, "ipfs://erc20-split");
    await escrow.connect(payer).acceptSettlement(id);

    expect(await token.balanceOf(recipient.address)).to.equal(recipientAmount);
    expect(await token.balanceOf(payer.address)).to.equal(payerAmount);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(0);
  });

  it("handles ERC20 service bond return on settlement", async function () {
    const amount = ethers.parseUnits("300", 18);
    const bond = ethers.parseUnits("30", 18);
    await token.mint(payer.address, amount);
    await token.mint(recipient.address, bond);

    const now = await latestTimestamp();
    const tx = await escrow
      .connect(creator)
      .createInvoice(recipient.address, await token.getAddress(), amount, "ipfs://erc20-bond", now + DAY, DAY);
    const receipt = await tx.wait();
    const id = receipt.logs.find((log) => log.fragment && log.fragment.name === "InvoiceCreated").args.invoiceId;

    await token.connect(recipient).approve(await escrow.getAddress(), bond);
    await escrow.connect(recipient).postServiceBond(id, bond);

    await token.connect(payer).approve(await escrow.getAddress(), amount);
    await escrow.connect(payer).payInvoice(id);

    const recipientAmount = ethers.parseUnits("240", 18);
    await escrow.connect(payer).proposeSettlement(id, recipientAmount, "ipfs://erc20-bonded-settlement");
    await escrow.connect(recipient).acceptSettlement(id);

    expect(await token.balanceOf(recipient.address)).to.equal(recipientAmount + bond);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(0);
  });

  it("preserves protocol solvency across active escrows, bonds, and credited payouts", async function () {
    const RejectETH = await ethers.getContractFactory("MockRejectETH");
    const rejectingRecipient = await RejectETH.deploy();
    const rejectingRecipientAddress = await rejectingRecipient.getAddress();

    const ethRefund = await createEthInvoice({ metadataHash: "ipfs://solvency-active-refund" });
    await escrow.connect(payer).payInvoice(ethRefund.id, { value: ethRefund.params.amount });
    await escrow.connect(payer).requestRefund(ethRefund.id);

    const ethCredit = await createEthInvoice({
      recipient: rejectingRecipientAddress,
      metadataHash: "ipfs://solvency-credit"
    });
    await escrow.connect(payer).payInvoice(ethCredit.id, { value: ethCredit.params.amount });
    await escrow.connect(payer).release(ethCredit.id);

    const ethBond = await createEthInvoice({ metadataHash: "ipfs://solvency-active-bond" });
    const activeEthBond = ethers.parseEther("0.02");
    await escrow.connect(recipient).postServiceBond(ethBond.id, activeEthBond, { value: activeEthBond });

    const tokenInvoice = await createTokenInvoice(token, { metadataHash: "ipfs://solvency-token" });
    const activeTokenBond = ethers.parseUnits("5", 18);
    await token.mint(payer.address, tokenInvoice.params.amount);
    await token.mint(recipient.address, activeTokenBond);
    await token.connect(recipient).approve(await escrow.getAddress(), activeTokenBond);
    await token.connect(payer).approve(await escrow.getAddress(), tokenInvoice.params.amount);
    await escrow.connect(recipient).postServiceBond(tokenInvoice.id, activeTokenBond);
    await escrow.connect(payer).payInvoice(tokenInvoice.id);

    await expectProtocolSolvent(
      [
        { address: ZERO_ADDRESS },
        { address: await token.getAddress(), contract: token }
      ],
      [payer.address, recipient.address, rejectingRecipientAddress]
    );
  });

  it("rejects ETH value on ERC20 invoice", async function () {
    const amount = ethers.parseUnits("10", 18);
    const now = await latestTimestamp();
    const tx = await escrow
      .connect(creator)
      .createInvoice(recipient.address, await token.getAddress(), amount, "ipfs://bad-erc20-pay", now + DAY, DAY);
    const receipt = await tx.wait();
    const id = receipt.logs.find((log) => log.fragment && log.fragment.name === "InvoiceCreated").args.invoiceId;

    await expect(escrow.connect(payer).payInvoice(id, { value: 1 })).to.be.revertedWithCustomError(
      escrow,
      "IncorrectPayment"
    );
  });

  it("rejects fee-on-transfer ERC20 invoice payment that receives less than requested", async function () {
    const amount = ethers.parseUnits("100", 18);
    await feeToken.mint(payer.address, amount);

    const now = await latestTimestamp();
    const tx = await escrow
      .connect(creator)
      .createInvoice(recipient.address, await feeToken.getAddress(), amount, "ipfs://fee-token", now + DAY, DAY);
    const receipt = await tx.wait();
    const id = receipt.logs.find((log) => log.fragment && log.fragment.name === "InvoiceCreated").args.invoiceId;

    await feeToken.connect(payer).approve(await escrow.getAddress(), amount);
    await expect(escrow.connect(payer).payInvoice(id)).to.be.revertedWithCustomError(escrow, "IncorrectPayment");
  });

  it("rejects fee-on-transfer ERC20 service bond that receives less than requested", async function () {
    const amount = ethers.parseUnits("100", 18);
    const bond = ethers.parseUnits("10", 18);
    await feeToken.mint(recipient.address, bond);

    const now = await latestTimestamp();
    const tx = await escrow
      .connect(creator)
      .createInvoice(recipient.address, await feeToken.getAddress(), amount, "ipfs://fee-bond", now + DAY, DAY);
    const receipt = await tx.wait();
    const id = receipt.logs.find((log) => log.fragment && log.fragment.name === "InvoiceCreated").args.invoiceId;

    await feeToken.connect(recipient).approve(await escrow.getAddress(), bond);
    await expect(escrow.connect(recipient).postServiceBond(id, bond)).to.be.revertedWithCustomError(
      escrow,
      "IncorrectPayment"
    );
  });
});
