"use client";

import {
  Ban,
  CheckCircle2,
  Copy,
  ExternalLink,
  FilePlus2,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Undo2,
  Wallet
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatEther, isAddress, keccak256, parseEther, parseUnits, toBytes, zeroAddress, zeroHash } from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWalletClient,
  useWriteContract
} from "wagmi";
import { assessInvoice, AgentAction, AgentContextRecord, InvoiceRecord, stateLabels } from "@/lib/agent";
import { invoiceEscrowAbi } from "@/lib/abi";
import { explorerBaseForChain, hardhat, targetLiveChain } from "@/lib/chains";
import { NATIVE_TOKEN_SYMBOL, formatTokenAmount } from "@/lib/tokens";

const DAY = 24 * 60 * 60;
const HOUR = 60 * 60;
const TARGET_CHAIN = targetLiveChain();

type CreateForm = {
  recipient: string;
  token: string;
  tokenDecimals: string;
  amount: string;
  metadataHash: string;
  dueDays: string;
  timeoutHours: string;
};

type MandateForm = {
  payerAgent: string;
  recipientAgent: string;
  mandate: string;
  policy: string;
  slaHours: string;
  authorizedPayer: string;
  mandateExpiryHours: string;
};

type ActionPermitForm = {
  action: string;
  executor: string;
  recipientAmount: string;
  dataHash: string;
  validAfterMinutes: string;
  expiresHours: string;
  nonce: string;
};

type ValidationForm = {
  subject: "recipient" | "payer";
  validatorAgent: string;
  approved: boolean;
  score: string;
  schema: string;
  evidenceURI: string;
  evidenceHash: string;
  teeAttestationHash: string;
  expiresHours: string;
  nonce: string;
};

type SignedActionPermit = {
  invoiceId: bigint;
  action: number;
  signer: `0x${string}`;
  executor: `0x${string}`;
  recipientAmount: bigint;
  dataHash: string;
  validAfter: bigint;
  expiresAt: bigint;
  nonce: bigint;
  signature: `0x${string}`;
  paramsHash: `0x${string}`;
};

type BondContextRecord = {
  activeAmount: bigint;
  resolvedAmount: bigint;
  resolvedRecipient: `0x${string}`;
  slashed: boolean;
};

type FeedbackContextRecord = {
  count: bigint;
  root: `0x${string}`;
};

type ValidationContextRecord = {
  count: bigint;
  root: `0x${string}`;
};

const defaultForm: CreateForm = {
  recipient: "",
  token: "",
  tokenDecimals: "18",
  amount: "0.05",
  metadataHash: "ipfs://MantleFlow-invoice-demo",
  dueDays: "7",
  timeoutHours: "72"
};

const defaultMandateForm: MandateForm = {
  payerAgent: "erc8004:payer-agent:max-spend-and-refund-rights",
  recipientAgent: "erc8004:service-agent:delivery-proof-required",
  mandate: "Pay for the invoice only under the attached metadata, delivery evidence, and settlement rules.",
  policy: "Release on buyer confirmation, attach evidence for disputes, allow counterparty-approved split settlement.",
  slaHours: "72",
  authorizedPayer: "",
  mandateExpiryHours: "168"
};

const defaultActionPermitForm: ActionPermitForm = {
  action: "1",
  executor: "",
  recipientAmount: "0.04",
  dataHash: "ipfs://MantleFlow-agent-action",
  validAfterMinutes: "0",
  expiresHours: "24",
  nonce: "1"
};

const defaultValidationForm: ValidationForm = {
  subject: "recipient",
  validatorAgent: "erc8004:validator-agent:receipt-auditor",
  approved: true,
  score: "92",
  schema: "schema:MantleFlow-delivery-validation-v1",
  evidenceURI: "ipfs://MantleFlow-validator-attestation",
  evidenceHash: "",
  teeAttestationHash: "tee:MantleFlow-validator-attestation",
  expiresHours: "24",
  nonce: "1"
};

const permitActionOptions = [
  { value: 0, label: "Release funds", needsAmount: false, needsData: false },
  { value: 1, label: "Request refund", needsAmount: false, needsData: false },
  { value: 2, label: "Refund", needsAmount: false, needsData: false },
  { value: 3, label: "Mark delivered", needsAmount: false, needsData: true },
  { value: 4, label: "Mark dispute", needsAmount: false, needsData: true },
  { value: 5, label: "Propose split", needsAmount: true, needsData: true },
  { value: 6, label: "Cancel split", needsAmount: false, needsData: false },
  { value: 7, label: "Accept split", needsAmount: false, needsData: false }
] as const;

const paymentMandateTypes = {
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
} as const;

const actionPermitTypes = {
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
} as const;

const validationAttestationTypes = {
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
} as const;

export default function Home() {
  const { address, isConnected, chain } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();

  const [form, setForm] = useState<CreateForm>(defaultForm);
  const [mandateForm, setMandateForm] = useState<MandateForm>(defaultMandateForm);
  const [actionPermitForm, setActionPermitForm] = useState<ActionPermitForm>(defaultActionPermitForm);
  const [validationForm, setValidationForm] = useState<ValidationForm>(defaultValidationForm);
  const [signedActionPermit, setSignedActionPermit] = useState<SignedActionPermit | null>(null);
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const [addressOverride, setAddressOverride] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [txError, setTxError] = useState("");
  const [deliveryHash, setDeliveryHash] = useState("ipfs://MantleFlow-delivery-proof");
  const [disputeHash, setDisputeHash] = useState("ipfs://MantleFlow-dispute-proof");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementMemoHash, setSettlementMemoHash] = useState("ipfs://MantleFlow-settlement-plan");
  const [serviceBondAmount, setServiceBondAmount] = useState("0.01");
  const [feedbackScore, setFeedbackScore] = useState("90");
  const [feedbackTag1, setFeedbackTag1] = useState("settlement");
  const [feedbackTag2, setFeedbackTag2] = useState("agent");
  const [feedbackURI, setFeedbackURI] = useState("ipfs://MantleFlow-agent-feedback");
  const [feedbackHash, setFeedbackHash] = useState("");

  useEffect(() => {
    const storedAddress = window.localStorage.getItem("MantleFlow-contract-address");
    if (storedAddress) setAddressOverride(storedAddress);
  }, []);

  useEffect(() => {
    if (address && !form.recipient) {
      setForm((current) => ({ ...current, recipient: address }));
    }
  }, [address, form.recipient]);

  useEffect(() => {
    if (address && !actionPermitForm.executor) {
      setActionPermitForm((current) => ({ ...current, executor: address }));
    }
  }, [address, actionPermitForm.executor]);

  const contractAddress = useMemo(() => {
    const envAddress = process.env.NEXT_PUBLIC_ESCROW_ADDRESS;
    const candidate = addressOverride || envAddress || "";
    return isAddress(candidate) ? (candidate as `0x${string}`) : undefined;
  }, [addressOverride]);

  const {
    data: invoiceCount,
    refetch: refetchCount,
    isLoading: countLoading
  } = useReadContract({
    address: contractAddress,
    abi: invoiceEscrowAbi,
    functionName: "invoiceCount",
    query: { enabled: Boolean(contractAddress) }
  });

  const invoiceIds = useMemo(() => {
    const count = Number(invoiceCount ?? 0n);
    const length = Math.min(count, 16);
    return Array.from({ length }, (_, index) => BigInt(count - 1 - index));
  }, [invoiceCount]);

  const invoiceContracts = useMemo(
    () =>
      invoiceIds.map((id) => ({
        address: contractAddress,
        abi: invoiceEscrowAbi,
        functionName: "getInvoice" as const,
        args: [id] as const
      })),
    [contractAddress, invoiceIds]
  );

  const {
    data: invoiceReadData,
    refetch: refetchInvoices,
    isLoading: invoicesLoading
  } = useReadContracts({
    contracts: invoiceContracts,
    query: { enabled: Boolean(contractAddress && invoiceContracts.length > 0) }
  });

  const invoices = useMemo(() => {
    return (invoiceReadData ?? [])
      .map((item, index) => (item.status === "success" && item.result ? toInvoiceRecord(invoiceIds[index], item.result) : null))
      .filter((invoice): invoice is InvoiceRecord => Boolean(invoice));
  }, [invoiceReadData, invoiceIds]);

  useEffect(() => {
    if (!selectedId && invoices.length > 0) {
      setSelectedId(invoices[0].id);
    }
  }, [invoices, selectedId]);

  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedId) ?? invoices[0];

  const {
    data: selectedAgentContextData,
    refetch: refetchAgentContext,
    isLoading: agentContextLoading,
    isFetched: agentContextFetched
  } = useReadContract({
    address: contractAddress,
    abi: invoiceEscrowAbi,
    functionName: "getAgentContext",
    args: selectedInvoice ? [selectedInvoice.id] : undefined,
    query: { enabled: Boolean(contractAddress && selectedInvoice) }
  });

  const {
    data: selectedReceiptHash,
    refetch: refetchReceiptHash
  } = useReadContract({
    address: contractAddress,
    abi: invoiceEscrowAbi,
    functionName: "settlementReceiptHash",
    args: selectedInvoice ? [selectedInvoice.id] : undefined,
    query: { enabled: Boolean(contractAddress && selectedInvoice) }
  });

  const {
    data: selectedBondContextData,
    refetch: refetchBondContext
  } = useReadContract({
    address: contractAddress,
    abi: invoiceEscrowAbi,
    functionName: "getBondContext",
    args: selectedInvoice ? [selectedInvoice.id] : undefined,
    query: { enabled: Boolean(contractAddress && selectedInvoice) }
  });

  const {
    data: selectedFeedbackContextData,
    refetch: refetchFeedbackContext
  } = useReadContract({
    address: contractAddress,
    abi: invoiceEscrowAbi,
    functionName: "getFeedbackContext",
    args: selectedInvoice ? [selectedInvoice.id] : undefined,
    query: { enabled: Boolean(contractAddress && selectedInvoice) }
  });

  const {
    data: selectedValidationContextData,
    refetch: refetchValidationContext
  } = useReadContract({
    address: contractAddress,
    abi: invoiceEscrowAbi,
    functionName: "getValidationContext",
    args: selectedInvoice ? [selectedInvoice.id] : undefined,
    query: { enabled: Boolean(contractAddress && selectedInvoice) }
  });

  const {
    data: selectedRequirementHash,
    refetch: refetchRequirementHash
  } = useReadContract({
    address: contractAddress,
    abi: invoiceEscrowAbi,
    functionName: "paymentRequirementHash",
    args: selectedInvoice ? [selectedInvoice.id] : undefined,
    query: { enabled: Boolean(contractAddress && selectedInvoice) }
  });

  const selectedAgentContext = selectedAgentContextData ? toAgentContextRecord(selectedAgentContextData) : undefined;
  const selectedBondContext = selectedBondContextData ? toBondContextRecord(selectedBondContextData) : undefined;
  const selectedFeedbackContext = selectedFeedbackContextData ? toFeedbackContextRecord(selectedFeedbackContextData) : undefined;
  const selectedValidationContext = selectedValidationContextData ? toValidationContextRecord(selectedValidationContextData) : undefined;
  const selectedInvoiceWithBond =
    selectedInvoice && selectedBondContext
      ? {
          ...selectedInvoice,
          serviceBondAmount: selectedBondContext.activeAmount,
          resolvedBondAmount: selectedBondContext.resolvedAmount,
          resolvedBondRecipient: selectedBondContext.resolvedRecipient,
          serviceBondSlashed: selectedBondContext.slashed
	        }
	      : selectedInvoice;
  const {
    data: selectedPendingPayoutData,
    refetch: refetchPendingPayout
  } = useReadContract({
    address: contractAddress,
    abi: invoiceEscrowAbi,
    functionName: "withdrawable",
    args: address && selectedInvoiceWithBond ? [address, selectedInvoiceWithBond.token] : undefined,
    query: { enabled: Boolean(contractAddress && address && selectedInvoiceWithBond) }
  });
  const agentContextLoaded = Boolean(
    selectedInvoice && !agentContextLoading && (agentContextFetched || selectedAgentContextData)
  );
  const assessment = selectedInvoiceWithBond
    ? assessInvoice(selectedInvoiceWithBond, address, undefined, selectedAgentContext, selectedReceiptHash, agentContextLoaded)
    : null;
  const pendingPayout = BigInt(selectedPendingPayoutData ?? 0n);
  const hasPendingPayout = pendingPayout > 0n;
  const agentNotes =
    assessment && hasPendingPayout && selectedInvoiceWithBond
      ? [`Pending payout credit: ${formatTokenValue(pendingPayout, selectedInvoiceWithBond.token)}. Withdraw it from escrow.`, ...assessment.notes]
      : assessment?.notes ?? [];
  const wrongChain = isConnected && chainId !== TARGET_CHAIN.id && chainId !== hardhat.id;
  const explorerBase = explorerBaseForChain(chainId);
  const selectedInvoiceId = selectedInvoice?.id.toString();
  const isSelectedActive = selectedInvoiceWithBond ? selectedInvoiceWithBond.state === 1 || selectedInvoiceWithBond.state === 2 : false;
  const isSelectedRecipient = Boolean(
    selectedInvoiceWithBond && address && selectedInvoiceWithBond.recipient.toLowerCase() === address.toLowerCase()
  );
  const isSelectedPayer = Boolean(
    selectedInvoiceWithBond && address && selectedInvoiceWithBond.payer.toLowerCase() === address.toLowerCase()
  );
  const canProposeSettlement = Boolean(selectedInvoiceWithBond && isSelectedActive && (isSelectedRecipient || isSelectedPayer));
  const settlementOpen = Boolean(selectedInvoiceWithBond && selectedInvoiceWithBond.settlementProposedBy !== zeroAddress);
  const mandateAttached = Boolean(agentContextLoaded && selectedAgentContext && selectedAgentContext.mandateHash !== zeroHash);
  const canSubmitFeedback = Boolean(
    selectedInvoiceWithBond && selectedInvoiceWithBond.state >= 3 && selectedInvoiceWithBond.state <= 6 && (isSelectedPayer || isSelectedRecipient)
  );
  const validationSubjectHash =
    validationForm.subject === "recipient"
      ? selectedAgentContext?.recipientAgentHash ?? zeroHash
      : selectedAgentContext?.payerAgentHash ?? zeroHash;
  const canSubmitValidation = Boolean(
    selectedInvoiceWithBond &&
      selectedInvoiceWithBond.state >= 3 &&
      selectedInvoiceWithBond.state <= 6 &&
      selectedAgentContext &&
      validationSubjectHash !== zeroHash
  );
  const isSettlementProposer = Boolean(
    selectedInvoiceWithBond &&
      address &&
      selectedInvoiceWithBond.settlementProposedBy.toLowerCase() === address.toLowerCase()
  );
  const canAcceptSettlement = Boolean(
    selectedInvoiceWithBond &&
      settlementOpen &&
      (isSelectedRecipient || isSelectedPayer) &&
      address &&
      selectedInvoiceWithBond.settlementProposedBy.toLowerCase() !== address.toLowerCase()
  );
  const selectedPermitAction =
    permitActionOptions.find((option) => option.value === Number(actionPermitForm.action)) ?? permitActionOptions[1];
  const signedPermitReadyForSelection = Boolean(signedActionPermit && selectedInvoiceWithBond?.id === signedActionPermit.invoiceId);
  const connectedCanExecutePermit = Boolean(
    signedActionPermit &&
      address &&
      (signedActionPermit.executor === zeroAddress || signedActionPermit.executor.toLowerCase() === address.toLowerCase())
  );

  useEffect(() => {
    if (!selectedInvoice) return;
    const suggested = (selectedInvoice.amount * 8n) / 10n;
    setSettlementAmount(trimDecimal(formatEther(suggested)));
    setSignedActionPermit(null);
  }, [selectedInvoiceId]);

  function updateContractAddress(nextAddress: string) {
    setAddressOverride(nextAddress);
    window.localStorage.setItem("MantleFlow-contract-address", nextAddress);
  }

  async function refreshAll() {
    await refetchCount();
    await refetchInvoices();
    await refetchAgentContext();
    await refetchReceiptHash();
    await refetchBondContext();
    await refetchRequirementHash();
    await refetchFeedbackContext();
    await refetchValidationContext();
    await refetchPendingPayout();
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTxError("");

    if (!contractAddress) {
      setTxError("Contract address is required.");
      return;
    }
    if (!isAddress(form.recipient)) {
      setTxError("Recipient address is invalid.");
      return;
    }

    const token = form.token.trim() ? form.token.trim() : zeroAddress;
    if (!isAddress(token)) {
      setTxError("Token address is invalid.");
      return;
    }

    let amount: bigint;
    try {
      const parsedDecimals = Number(form.tokenDecimals || "18");
      const tokenDecimals = Number.isFinite(parsedDecimals) ? Math.min(36, Math.max(0, Math.round(parsedDecimals))) : 18;
      amount =
        token === zeroAddress
          ? parseEther(form.amount || "0")
          : parseUnits(form.amount || "0", tokenDecimals);
    } catch {
      setTxError("Amount is invalid.");
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const dueDays = Math.max(0, Number(form.dueDays || "0"));
    const timeoutHours = Math.max(1, Number(form.timeoutHours || "1"));
    const dueAt = BigInt(now + Math.round(dueDays * DAY));
    const timeout = BigInt(Math.round(timeoutHours * HOUR));
    await runWrite("createInvoice", [
      form.recipient as `0x${string}`,
      token as `0x${string}`,
      amount,
      form.metadataHash || "ipfs://MantleFlow-invoice",
      dueAt,
      timeout
    ]);
  }

  async function runAction(action: AgentAction["id"], invoice: InvoiceRecord) {
    if (action === "pay") {
      await runWrite("payInvoice", [invoice.id], invoice.token === zeroAddress ? invoice.amount : undefined);
      return;
    }
    if (action === "release") {
      await runWrite("release", [invoice.id]);
      return;
    }
    if (action === "requestRefund") {
      await runWrite("requestRefund", [invoice.id]);
      return;
    }
    if (action === "refund") {
      await runWrite("refund", [invoice.id]);
      return;
    }
    if (action === "acceptSettlement") {
      await runWrite("acceptSettlement", [invoice.id]);
      return;
    }
    await runWrite("cancelUnpaid", [invoice.id]);
  }

  async function submitDelivery(invoice: InvoiceRecord) {
    const evidence = deliveryHash.trim();
    if (!evidence) {
      setTxError("Delivery evidence hash is required.");
      return;
    }
    await runWrite("markDelivered", [invoice.id, evidence]);
  }

  async function submitDispute(invoice: InvoiceRecord) {
    const evidence = disputeHash.trim();
    if (!evidence) {
      setTxError("Dispute evidence hash is required.");
      return;
    }
    await runWrite("markDisputed", [invoice.id, evidence]);
  }

  async function submitSettlement(invoice: InvoiceRecord) {
    let recipientAmount: bigint;
    try {
      recipientAmount = parseEther(settlementAmount || "0");
    } catch {
      setTxError("Settlement amount is invalid.");
      return;
    }
    if (recipientAmount > invoice.amount) {
      setTxError("Settlement recipient amount cannot exceed invoice amount.");
      return;
    }
    await runWrite("proposeSettlement", [invoice.id, recipientAmount, settlementMemoHash || "ipfs://MantleFlow-settlement"]);
  }

  async function submitMandate(invoice: InvoiceRecord) {
    const mandate = mandateForm.mandate.trim();
    if (!mandate) {
      setTxError("Agent mandate text or hash is required.");
      return;
    }
    const slaHours = Math.max(0, Number(mandateForm.slaHours || "0"));
    const slaDeadline = slaHours > 0 ? BigInt(Math.floor(Date.now() / 1000) + Math.round(slaHours * HOUR)) : 0n;
    const payerAgentHash = hashOrZero(mandateForm.payerAgent);
    const recipientAgentHash = hashOrZero(mandateForm.recipientAgent);
    const mandateHash = hashText(mandate);
    const policyHash = hashOrZero(mandateForm.policy);
    const intentMandateHash = hashText(`ap2:intent:${mandate}`);
    const cartMandateHash = hashText(
      `ap2:cart:${invoice.recipient}:${invoice.token}:${invoice.amount.toString()}:${invoice.metadataHash}`
    );
    const paymentMandateHash = mandateHash;
    const promptPlaybackHash = hashOrZero(mandateForm.policy || mandate);
    const authorizedPayer = mandateForm.authorizedPayer.trim();

    if (!authorizedPayer) {
      await runWrite("attachAP2AgentMandate", [
        invoice.id,
        payerAgentHash,
        recipientAgentHash,
        intentMandateHash,
        cartMandateHash,
        paymentMandateHash,
        promptPlaybackHash,
        policyHash,
        slaDeadline
      ]);
      return;
    }

    if (!isAddress(authorizedPayer)) {
      setTxError("Authorized payer address is invalid.");
      return;
    }
    if (!address || authorizedPayer.toLowerCase() !== address.toLowerCase()) {
      setTxError("Connect the authorized payer wallet to sign this mandate.");
      return;
    }
    if (!walletClient || !contractAddress) {
      setTxError("Wallet signing is unavailable.");
      return;
    }

    const expiryHours = Math.max(1, Number(mandateForm.mandateExpiryHours || "1"));
    const mandateExpiresAt = BigInt(Math.floor(Date.now() / 1000) + Math.round(expiryHours * HOUR));
    const paymentRequirementHash =
      selectedRequirementHash ??
      ((await publicClient?.readContract({
        address: contractAddress,
        abi: invoiceEscrowAbi,
        functionName: "paymentRequirementHash",
        args: [invoice.id]
      })) as `0x${string}` | undefined);

    if (!paymentRequirementHash) {
      setTxError("Payment requirement hash is unavailable.");
      return;
    }

    const signature = await walletClient.signTypedData({
      account: address,
      domain: {
        name: "MantleFlow Agentic Settlement",
        version: "1",
        chainId,
        verifyingContract: contractAddress
      },
      primaryType: "PaymentMandate",
      types: paymentMandateTypes,
      message: {
        invoiceId: invoice.id,
        payer: authorizedPayer as `0x${string}`,
        paymentRequirementHash,
        payerAgentHash,
        recipientAgentHash,
        mandateHash,
        policyHash,
        slaDeadline,
        expiresAt: mandateExpiresAt
      }
    });

    await runWrite("attachSignedAgentMandate", [
      invoice.id,
      authorizedPayer as `0x${string}`,
      payerAgentHash,
      recipientAgentHash,
      mandateHash,
      policyHash,
      slaDeadline,
      mandateExpiresAt,
      signature
    ]);
  }

  async function signActionPermit(invoice: InvoiceRecord) {
    if (!walletClient || !address || !contractAddress || !publicClient) {
      setTxError("Wallet signing is unavailable.");
      return;
    }

    const executor = actionPermitForm.executor.trim();
    if (!isAddress(executor)) {
      setTxError("Executor address is invalid.");
      return;
    }

    const action = selectedPermitAction.value;
    const dataHash = selectedPermitAction.needsData ? actionPermitForm.dataHash.trim() : "";
    if (selectedPermitAction.needsData && !dataHash) {
      setTxError("Permit data hash is required.");
      return;
    }

    let recipientAmount = 0n;
    if (selectedPermitAction.needsAmount) {
      try {
        recipientAmount = parseEther(actionPermitForm.recipientAmount || "0");
      } catch {
        setTxError("Permit recipient amount is invalid.");
        return;
      }
      if (recipientAmount > invoice.amount) {
        setTxError("Permit recipient amount cannot exceed invoice amount.");
        return;
      }
    }

    let nonce: bigint;
    try {
      nonce = BigInt(actionPermitForm.nonce || "0");
    } catch {
      setTxError("Permit nonce is invalid.");
      return;
    }
    if (nonce < 0n) {
      setTxError("Permit nonce is invalid.");
      return;
    }

    const validAfterMinutes = Math.max(0, Number(actionPermitForm.validAfterMinutes || "0"));
    const expiresHours = Math.max(1, Number(actionPermitForm.expiresHours || "1"));
    const now = Math.floor(Date.now() / 1000);
    const validAfter = validAfterMinutes > 0 ? BigInt(now + Math.round(validAfterMinutes * 60)) : 0n;
    const expiresAt = BigInt(now + Math.round(expiresHours * HOUR));

    try {
      setPendingAction("signActionPermit");
      setTxError("");
      const paramsHash = (await publicClient.readContract({
        address: contractAddress,
        abi: invoiceEscrowAbi,
        functionName: "actionParamsHash",
        args: [action, recipientAmount, dataHash]
      })) as `0x${string}`;

      const signature = await walletClient.signTypedData({
        account: address,
        domain: {
          name: "MantleFlow Agentic Settlement",
          version: "1",
          chainId,
          verifyingContract: contractAddress
        },
        primaryType: "ActionPermit",
        types: actionPermitTypes,
        message: {
          invoiceId: invoice.id,
          action,
          signer: address,
          executor: executor as `0x${string}`,
          paramsHash,
          validAfter,
          expiresAt,
          nonce
        }
      });

      setSignedActionPermit({
        invoiceId: invoice.id,
        action,
        signer: address,
        executor: executor as `0x${string}`,
        recipientAmount,
        dataHash,
        validAfter,
        expiresAt,
        nonce,
        signature,
        paramsHash
      });
    } catch (error) {
      setTxError(getErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function executeSignedActionPermit() {
    if (!signedActionPermit) {
      setTxError("No signed action permit is ready.");
      return;
    }
    await runWrite("executeActionPermit", [
      {
        invoiceId: signedActionPermit.invoiceId,
        action: signedActionPermit.action,
        signer: signedActionPermit.signer,
        executor: signedActionPermit.executor,
        recipientAmount: signedActionPermit.recipientAmount,
        dataHash: signedActionPermit.dataHash,
        validAfter: signedActionPermit.validAfter,
        expiresAt: signedActionPermit.expiresAt,
        nonce: signedActionPermit.nonce,
        signature: signedActionPermit.signature
      }
    ]);
  }

  async function submitServiceBond(invoice: InvoiceRecord) {
    let amount: bigint;
    try {
      amount = parseEther(serviceBondAmount || "0");
    } catch {
      setTxError("Service bond amount is invalid.");
      return;
    }
    if (amount === 0n) {
      setTxError("Service bond amount must be greater than zero.");
      return;
    }
    await runWrite("postServiceBond", [invoice.id, amount], invoice.token === zeroAddress ? amount : undefined);
  }

  async function withdrawPendingPayout(invoice: InvoiceRecord) {
    await runWrite("withdraw", [invoice.token]);
  }

  async function submitFeedback(invoice: InvoiceRecord) {
    const score = Math.round(Number(feedbackScore || "0"));
    if (!Number.isFinite(score) || score < -100 || score > 100) {
      setTxError("Feedback score must be between -100 and 100.");
      return;
    }
    if (!isSelectedPayer && !isSelectedRecipient) {
      setTxError("Only payer or recipient can submit settlement feedback.");
      return;
    }

    await runWrite("submitAgentFeedback", [
      invoice.id,
      isSelectedPayer,
      BigInt(score),
      feedbackTag1,
      feedbackTag2,
      feedbackURI,
      hashOrZero(feedbackHash)
    ]);
  }

  async function submitValidation(invoice: InvoiceRecord) {
    if (!walletClient || !address || !contractAddress || !publicClient) {
      setTxError("Wallet signing is unavailable.");
      return;
    }
    if (!canSubmitValidation || validationSubjectHash === zeroHash) {
      setTxError("Attach an agent mandate and finalize the invoice before validation.");
      return;
    }

    const score = Math.round(Number(validationForm.score || "0"));
    if (!Number.isFinite(score) || score < -100 || score > 100) {
      setTxError("Validation score must be between -100 and 100.");
      return;
    }

    let nonce: bigint;
    try {
      nonce = BigInt(validationForm.nonce || "0");
    } catch {
      setTxError("Validation nonce is invalid.");
      return;
    }
    if (nonce < 0n) {
      setTxError("Validation nonce is invalid.");
      return;
    }

    const validatorAgentHash = hashOrZero(validationForm.validatorAgent);
    if (validatorAgentHash === zeroHash) {
      setTxError("Validator agent hash or text is required.");
      return;
    }

    const evidenceURI = validationForm.evidenceURI.trim();
    if (!evidenceURI) {
      setTxError("Validation evidence URI is required.");
      return;
    }

    const expiresHours = Math.max(1, Number(validationForm.expiresHours || "1"));
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + Math.round(expiresHours * HOUR));
    const schemaHash = hashOrZero(validationForm.schema);
    const evidenceHash = hashOrZero(validationForm.evidenceHash);
    const teeAttestationHash = hashOrZero(validationForm.teeAttestationHash);
    const receiptHash =
      selectedReceiptHash ??
      ((await publicClient.readContract({
        address: contractAddress,
        abi: invoiceEscrowAbi,
        functionName: "settlementReceiptHash",
        args: [invoice.id]
      })) as `0x${string}`);
    const evidenceURIHash = keccak256(toBytes(evidenceURI));

    try {
      setPendingAction("submitAgentValidation");
      setTxError("");
      const signature = await walletClient.signTypedData({
        account: address,
        domain: {
          name: "MantleFlow Agentic Settlement",
          version: "1",
          chainId,
          verifyingContract: contractAddress
        },
        primaryType: "ValidationAttestation",
        types: validationAttestationTypes,
        message: {
          invoiceId: invoice.id,
          validator: address,
          validatorAgentHash,
          subjectAgentHash: validationSubjectHash,
          approved: validationForm.approved,
          score: BigInt(score),
          receiptHash,
          schemaHash,
          evidenceURIHash,
          evidenceHash,
          teeAttestationHash,
          expiresAt,
          nonce
        }
      });

      await runWrite("submitAgentValidation", [
        {
          invoiceId: invoice.id,
          validator: address,
          validatorAgentHash,
          subjectAgentHash: validationSubjectHash,
          approved: validationForm.approved,
          score: BigInt(score),
          schemaHash,
          evidenceURI,
          evidenceHash,
          teeAttestationHash,
          expiresAt,
          nonce,
          signature
        }
      ]);
    } catch (error) {
      setTxError(getErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function runWrite(functionName: string, args: readonly unknown[], value?: bigint) {
    if (!contractAddress) {
      setTxError("Contract address is required.");
      return;
    }

    try {
      setPendingAction(functionName);
      setTxError("");
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: invoiceEscrowAbi,
        functionName,
        args,
        value
      } as never);
      setTxHash(hash);
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await refreshAll();
    } catch (error) {
      setTxError(getErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  const activeConnector = connectors[0];

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">AF</div>
          <div>
            <h1>MantleFlow</h1>
            <span>{TARGET_CHAIN.name} settlement desk</span>
          </div>
        </div>

        <div className="walletControls">
          {wrongChain ? (
            <button className="button warning" type="button" onClick={() => switchChain({ chainId: TARGET_CHAIN.id })}>
              <Link2 aria-hidden />
              {TARGET_CHAIN.name}
            </button>
          ) : null}

          {isConnected ? (
            <>
              <span className="addressPill">{shortAddress(address)}</span>
              <button className="iconButton" type="button" title="Disconnect wallet" onClick={() => disconnect()}>
                <LogOut aria-hidden />
              </button>
            </>
          ) : (
            <button className="button primary" type="button" disabled={!activeConnector || isConnecting} onClick={() => connect({ connector: activeConnector })}>
              {isConnecting ? <Loader2 className="spin" aria-hidden /> : <Wallet aria-hidden />}
              Connect
            </button>
          )}
        </div>
      </header>

      <section className="summaryRail" aria-label="Project status">
        <StatusTile label="Contract" value={contractAddress ? shortAddress(contractAddress) : "unset"} tone={contractAddress ? "good" : "warn"} />
        <StatusTile label="Invoices" value={countLoading ? "..." : String(invoiceCount ?? 0n)} tone="neutral" />
        <StatusTile label="Chain" value={chain?.name ?? "wallet off"} tone={wrongChain ? "warn" : "good"} />
        <StatusTile label="Agent" value="state aware" tone="good" />
      </section>

      <section className="contractBar">
        <label htmlFor="contractAddress">Contract address</label>
        <input
          id="contractAddress"
          value={addressOverride}
          onChange={(event) => updateContractAddress(event.target.value)}
          placeholder={process.env.NEXT_PUBLIC_ESCROW_ADDRESS || "0x..."}
          spellCheck={false}
        />
        {contractAddress && explorerBase ? (
          <a className="iconButton linkButton" href={`${explorerBase}/address/${contractAddress}`} target="_blank" rel="noreferrer" title="Open explorer">
            <ExternalLink aria-hidden />
          </a>
        ) : null}
        <button className="iconButton" type="button" onClick={refreshAll} title="Refresh invoices">
          <RefreshCw aria-hidden />
        </button>
      </section>

      <div className="workspace">
        <section className="panel createPanel">
          <div className="panelHeader">
            <div>
              <span className="eyebrow">New invoice</span>
              <h2>Create escrow</h2>
            </div>
            <FilePlus2 aria-hidden />
          </div>

          <form className="formGrid" onSubmit={submitCreate}>
            <label>
              Recipient
              <input
                value={form.recipient}
                onChange={(event) => setForm({ ...form, recipient: event.target.value })}
                placeholder="0x..."
                spellCheck={false}
              />
            </label>

            <label>
              Amount
              <input
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                inputMode="decimal"
                placeholder="0.05"
              />
            </label>

            <label>
              Token
              <input
                value={form.token}
                onChange={(event) => setForm({ ...form, token: event.target.value })}
                      placeholder={NATIVE_TOKEN_SYMBOL}
                spellCheck={false}
              />
              <span className="tokenPresetRow" role="group" aria-label="Token presets">
                <button
                  className={`tokenPreset ${isEthFormToken(form.token) ? "active" : ""}`}
                  type="button"
                  onClick={() => setForm({ ...form, token: "", tokenDecimals: "18", amount: form.amount || "0.05" })}
                >
                  <Wallet aria-hidden />
                  {NATIVE_TOKEN_SYMBOL}
                </button>
              </span>
            </label>

            <label>
              Decimals
              <input
                value={form.tokenDecimals}
                onChange={(event) => setForm({ ...form, tokenDecimals: event.target.value })}
                inputMode="numeric"
                placeholder="18"
              />
            </label>

            <label>
              Metadata
              <input
                value={form.metadataHash}
                onChange={(event) => setForm({ ...form, metadataHash: event.target.value })}
                placeholder="ipfs://..."
                spellCheck={false}
              />
            </label>

            <label>
              Due days
              <input
                value={form.dueDays}
                onChange={(event) => setForm({ ...form, dueDays: event.target.value })}
                inputMode="decimal"
                placeholder="7"
              />
            </label>

            <label>
              Timeout hours
              <input
                value={form.timeoutHours}
                onChange={(event) => setForm({ ...form, timeoutHours: event.target.value })}
                inputMode="decimal"
                placeholder="72"
              />
            </label>

            <button className="button primary fullWidth" disabled={!isConnected || Boolean(pendingAction)} type="submit">
              {pendingAction === "createInvoice" ? <Loader2 className="spin" aria-hidden /> : <FilePlus2 aria-hidden />}
              Create
            </button>
          </form>
        </section>

        <section className="panel ledgerPanel">
          <div className="panelHeader">
            <div>
              <span className="eyebrow">Live ledger</span>
              <h2>Invoices</h2>
            </div>
            <button className="iconButton" type="button" onClick={refreshAll} title="Refresh ledger">
              <RefreshCw aria-hidden />
            </button>
          </div>

          <div className="invoiceList">
            {invoicesLoading ? <div className="emptyState">Loading invoices</div> : null}
            {!invoicesLoading && invoices.length === 0 ? <div className="emptyState">No invoices found</div> : null}
            {invoices.map((invoice) => (
              <button
                key={invoice.id.toString()}
                className={`invoiceRow ${selectedInvoice?.id === invoice.id ? "selected" : ""}`}
                type="button"
                onClick={() => setSelectedId(invoice.id)}
              >
                <div>
                  <strong>#{invoice.id.toString()}</strong>
                  <span>{invoice.metadataHash}</span>
                </div>
                <div className="invoiceMeta">
                  <StatusBadge state={invoice.state} />
                  <span>{formatAmount(invoice)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside className="panel agentPanel">
          <div className="panelHeader">
            <div>
              <span className="eyebrow">Agent</span>
              <h2>Next action</h2>
            </div>
            <ShieldCheck aria-hidden />
          </div>

          {selectedInvoiceWithBond && assessment ? (
            <>
              <div className={`agentCallout ${assessment.risk}`}>
                <span>{stateLabels[selectedInvoiceWithBond.state]}</span>
                <p>{assessment.headline}</p>
              </div>

              <dl className="detailList">
                <div>
                  <dt>Recipient</dt>
                  <dd>{shortAddress(selectedInvoiceWithBond.recipient)}</dd>
                </div>
                <div>
                  <dt>Payer</dt>
                  <dd>{selectedInvoiceWithBond.payer === zeroAddress ? "open" : shortAddress(selectedInvoiceWithBond.payer)}</dd>
                </div>
                <div>
                  <dt>Due</dt>
                  <dd>{formatTimestamp(selectedInvoiceWithBond.dueAt)}</dd>
                </div>
                <div>
                  <dt>Timeout</dt>
                  <dd>{formatDuration(selectedInvoiceWithBond.timeout)}</dd>
                </div>
                <div>
                  <dt>Delivery</dt>
                  <dd>{selectedInvoiceWithBond.deliveryEvidenceCount > 0n ? `${selectedInvoiceWithBond.deliveryEvidenceCount.toString()} item` : "missing"}</dd>
                </div>
                <div>
                  <dt>Dispute</dt>
                  <dd>{selectedInvoiceWithBond.disputeEvidenceCount > 0n ? `${selectedInvoiceWithBond.disputeEvidenceCount.toString()} item` : "none"}</dd>
                </div>
                <div>
                  <dt>Settlement</dt>
                  <dd>{settlementOpen ? "proposed" : "none"}</dd>
                </div>
	                <div>
	                  <dt>Mandate</dt>
	                  <dd>{agentContextLoaded ? (mandateAttached ? "attached" : "missing") : "loading"}</dd>
	                </div>
	                <div>
	                  <dt>Payer lock</dt>
	                  <dd>
	                    {!agentContextLoaded
	                      ? "checking"
	                      : selectedAgentContext?.authorizedPayer && selectedAgentContext.authorizedPayer !== zeroAddress
	                        ? shortAddress(selectedAgentContext.authorizedPayer)
	                        : "open"}
	                  </dd>
	                </div>
                <div>
                  <dt>Payment req</dt>
                  <dd>{selectedRequirementHash ? shortHash(selectedRequirementHash) : "pending"}</dd>
                </div>
                <div>
                  <dt>Receipt</dt>
                  <dd>{selectedReceiptHash ? shortHash(selectedReceiptHash) : "pending"}</dd>
                </div>
	                <div>
	                  <dt>Bond</dt>
	                  <dd>{formatBondStatus(selectedInvoiceWithBond)}</dd>
	                </div>
	                <div>
	                  <dt>Payout</dt>
	                  <dd>{hasPendingPayout ? formatTokenValue(pendingPayout, selectedInvoiceWithBond.token) : "none"}</dd>
	                </div>
                <div>
                  <dt>Feedback</dt>
                  <dd>{selectedFeedbackContext && selectedFeedbackContext.count > 0n ? `${selectedFeedbackContext.count.toString()} item` : "none"}</dd>
                </div>
                <div>
                  <dt>Validation</dt>
                  <dd>{selectedValidationContext && selectedValidationContext.count > 0n ? `${selectedValidationContext.count.toString()} item` : "none"}</dd>
                </div>
              </dl>

	              <div className="actionStack">
	                {assessment.actions.map((action) => (
                  <button
                    key={action.id}
                    className="button action"
                    type="button"
                    disabled={!action.enabled || !isConnected || Boolean(pendingAction)}
                    title={action.reason}
                    onClick={() => runAction(action.id, selectedInvoiceWithBond)}
                  >
                    {actionIcon(action.id, pendingAction)}
	                    {action.label}
	                  </button>
	                ))}
	                {hasPendingPayout ? (
	                  <button
	                    className="button action"
	                    type="button"
	                    disabled={!isConnected || Boolean(pendingAction)}
	                    title="Withdraw a pending payout that was credited after a recipient transfer failed."
	                    onClick={() => withdrawPendingPayout(selectedInvoiceWithBond)}
	                  >
	                    {pendingAction === "withdraw" ? <Loader2 className="spin" aria-hidden /> : <RotateCcw aria-hidden />}
	                    Withdraw payout
	                  </button>
	                ) : null}
	              </div>

              <section className="mandateDesk" aria-label="Agent mandate">
                <label>
                  Payer agent
                  <input
                    value={mandateForm.payerAgent}
                    onChange={(event) => setMandateForm({ ...mandateForm, payerAgent: event.target.value })}
                    placeholder="erc8004:payer-agent"
                    spellCheck={false}
                  />
                </label>
                <label>
                  Service agent
                  <input
                    value={mandateForm.recipientAgent}
                    onChange={(event) => setMandateForm({ ...mandateForm, recipientAgent: event.target.value })}
                    placeholder="erc8004:service-agent"
                    spellCheck={false}
                  />
                </label>
                <label>
                  Mandate
                  <input
                    value={mandateForm.mandate}
                    onChange={(event) => setMandateForm({ ...mandateForm, mandate: event.target.value })}
                    placeholder="signed payment intent or 0x hash"
                    spellCheck={false}
                  />
                </label>
                <label>
                  Policy
                  <input
                    value={mandateForm.policy}
                    onChange={(event) => setMandateForm({ ...mandateForm, policy: event.target.value })}
                    placeholder="agent risk policy or 0x hash"
                    spellCheck={false}
                  />
                </label>
                <label>
                  SLA hours
                  <input
                    value={mandateForm.slaHours}
                    onChange={(event) => setMandateForm({ ...mandateForm, slaHours: event.target.value })}
                    inputMode="decimal"
                    placeholder="72"
                  />
                </label>
                <label>
                  Authorized payer
                  <input
                    value={mandateForm.authorizedPayer}
                    onChange={(event) => setMandateForm({ ...mandateForm, authorizedPayer: event.target.value })}
                    placeholder="0x... optional"
                    spellCheck={false}
                  />
                </label>
                <label>
                  Mandate expiry
                  <input
                    value={mandateForm.mandateExpiryHours}
                    onChange={(event) => setMandateForm({ ...mandateForm, mandateExpiryHours: event.target.value })}
                    inputMode="decimal"
                    placeholder="168"
                  />
                </label>
                <button
                  className="button action"
                  type="button"
                  disabled={!isConnected || !selectedInvoiceWithBond || selectedInvoiceWithBond.state !== 0 || Boolean(pendingAction)}
                  title="Attach a hashed mandate before payment, optionally with a connected authorized-payer EIP-712 signature."
                  onClick={() => submitMandate(selectedInvoiceWithBond)}
                >
                  {pendingAction === "attachAgentMandate" ||
                  pendingAction === "attachAP2AgentMandate" ||
                  pendingAction === "attachSignedAgentMandate" ? (
                    <Loader2 className="spin" aria-hidden />
                  ) : (
                    <ShieldCheck aria-hidden />
                  )}
                  Attach mandate
                </button>
                {selectedAgentContext && mandateAttached ? (
                  <div className="proposalBox">
                    <span>Mandate proof</span>
                    <strong>{selectedReceiptHash ? shortHash(selectedReceiptHash) : "pending"}</strong>
                    <small>
                      Requirement {selectedRequirementHash ? shortHash(selectedRequirementHash) : "pending"} · Payer{" "}
                      {selectedAgentContext.authorizedPayer !== zeroAddress ? shortAddress(selectedAgentContext.authorizedPayer) : "open"}
                    </small>
                    <div className="hashGrid" aria-label="AP2 mandate hashes">
                      <span>Intent</span>
                      <code>{shortHash(selectedAgentContext.intentMandateHash)}</code>
                      <span>Cart</span>
                      <code>{shortHash(selectedAgentContext.cartMandateHash)}</code>
                      <span>Payment</span>
                      <code>{shortHash(selectedAgentContext.paymentMandateHash)}</code>
                      <span>Prompt</span>
                      <code>{shortHash(selectedAgentContext.promptPlaybackHash)}</code>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="settlementDesk" aria-label="Action permit">
                <div className="splitInputs">
                  <label>
                    Permit action
                    <select
                      value={actionPermitForm.action}
                      onChange={(event) => {
                        setSignedActionPermit(null);
                        setActionPermitForm({ ...actionPermitForm, action: event.target.value });
                      }}
                    >
                      {permitActionOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Executor
                    <input
                      value={actionPermitForm.executor}
                      onChange={(event) => {
                        setSignedActionPermit(null);
                        setActionPermitForm({ ...actionPermitForm, executor: event.target.value });
                      }}
                      placeholder="0x..."
                      spellCheck={false}
                    />
                  </label>
                </div>

                {selectedPermitAction.needsAmount || selectedPermitAction.needsData ? (
                  <div className="splitInputs">
                    <label>
                      Recipient payout
                      <input
                        value={actionPermitForm.recipientAmount}
                        onChange={(event) => {
                          setSignedActionPermit(null);
                          setActionPermitForm({ ...actionPermitForm, recipientAmount: event.target.value });
                        }}
                        disabled={!selectedPermitAction.needsAmount}
                        inputMode="decimal"
                        placeholder="0.04"
                      />
                    </label>
                    <label>
                      Data hash
                      <input
                        value={actionPermitForm.dataHash}
                        onChange={(event) => {
                          setSignedActionPermit(null);
                          setActionPermitForm({ ...actionPermitForm, dataHash: event.target.value });
                        }}
                        disabled={!selectedPermitAction.needsData}
                        placeholder="ipfs://agent-action"
                        spellCheck={false}
                      />
                    </label>
                  </div>
                ) : null}

                <div className="splitInputs">
                  <label>
                    Valid after
                    <input
                      value={actionPermitForm.validAfterMinutes}
                      onChange={(event) => {
                        setSignedActionPermit(null);
                        setActionPermitForm({ ...actionPermitForm, validAfterMinutes: event.target.value });
                      }}
                      inputMode="decimal"
                      placeholder="0"
                    />
                  </label>
                  <label>
                    Expires
                    <input
                      value={actionPermitForm.expiresHours}
                      onChange={(event) => {
                        setSignedActionPermit(null);
                        setActionPermitForm({ ...actionPermitForm, expiresHours: event.target.value });
                      }}
                      inputMode="decimal"
                      placeholder="24"
                    />
                  </label>
                </div>

                <label>
                  Nonce
                  <input
                    value={actionPermitForm.nonce}
                    onChange={(event) => {
                      setSignedActionPermit(null);
                      setActionPermitForm({ ...actionPermitForm, nonce: event.target.value });
                    }}
                    inputMode="numeric"
                    placeholder="1"
                  />
                </label>

                <div className="splitInputs">
                  <button
                    className="button action"
                    type="button"
                    disabled={!isConnected || !selectedInvoiceWithBond || Boolean(pendingAction)}
                    title="Sign a scoped EIP-712 action permit."
                    onClick={() => signActionPermit(selectedInvoiceWithBond)}
                  >
                    {pendingAction === "signActionPermit" ? <Loader2 className="spin" aria-hidden /> : <ShieldCheck aria-hidden />}
                    Sign permit
                  </button>
                  <button
                    className="button action"
                    type="button"
                    disabled={!signedPermitReadyForSelection || !connectedCanExecutePermit || Boolean(pendingAction)}
                    title="Execute the last signed action permit."
                    onClick={executeSignedActionPermit}
                  >
                    {pendingAction === "executeActionPermit" ? <Loader2 className="spin" aria-hidden /> : <Send aria-hidden />}
                    Execute permit
                  </button>
                </div>

                {signedActionPermit && signedPermitReadyForSelection ? (
                  <div className="proposalBox">
                    <span>Action permit</span>
                    <strong>{shortHash(signedActionPermit.paramsHash)}</strong>
                    <small>
                      {permitActionOptions.find((option) => option.value === signedActionPermit.action)?.label ?? "Action"} · signer{" "}
                      {shortAddress(signedActionPermit.signer)} · executor {shortAddress(signedActionPermit.executor)}
                    </small>
                  </div>
                ) : null}
              </section>

              <section className="bondDesk" aria-label="Service bond">
                <label>
                  Provider bond
                  <input
                    value={serviceBondAmount}
                    onChange={(event) => setServiceBondAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.01"
                  />
                </label>
                <button
                  className="button action"
                  type="button"
	                  disabled={
	                    !isConnected ||
	                    !isSelectedRecipient ||
	                    (selectedInvoiceWithBond.state !== 0 && selectedInvoiceWithBond.state !== 1) ||
	                    Boolean(pendingAction)
	                  }
                  title="Recipient can post an optional service bond. It returns on clean settlement and can be slashed if SLA is missed without timely delivery evidence."
                  onClick={() => submitServiceBond(selectedInvoiceWithBond)}
                >
                  {pendingAction === "postServiceBond" ? <Loader2 className="spin" aria-hidden /> : <ShieldCheck aria-hidden />}
                  Post bond
                </button>
                <div className="proposalBox">
                  <span>SLA bond status</span>
                  <strong>{formatBondStatus(selectedInvoiceWithBond)}</strong>
                  <small>{formatBondDetail(selectedInvoiceWithBond)}</small>
                </div>
              </section>

              <section className="settlementDesk" aria-label="Settlement tools">
                <label>
                  Delivery evidence
                  <input
                    value={deliveryHash}
                    onChange={(event) => setDeliveryHash(event.target.value)}
                    placeholder="ipfs://delivery-proof"
                    spellCheck={false}
                  />
                </label>
                <button
                  className="button action"
                  type="button"
                  disabled={!isConnected || !isSelectedRecipient || !isSelectedActive || Boolean(pendingAction)}
                  title="Recipient can attach delivery evidence while the invoice is paid or refund requested."
                  onClick={() => submitDelivery(selectedInvoiceWithBond)}
                >
                  {pendingAction === "markDelivered" ? <Loader2 className="spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
                  Mark delivered
                </button>

                <label>
                  Dispute evidence
                  <input
                    value={disputeHash}
                    onChange={(event) => setDisputeHash(event.target.value)}
                    placeholder="ipfs://dispute-proof"
                    spellCheck={false}
                  />
                </label>
                <button
                  className="button action"
                  type="button"
                  disabled={!isConnected || !isSelectedPayer || !isSelectedActive || Boolean(pendingAction)}
                  title="Payer can attach dispute evidence while the invoice is paid or refund requested."
                  onClick={() => submitDispute(selectedInvoiceWithBond)}
                >
                  {pendingAction === "markDisputed" ? <Loader2 className="spin" aria-hidden /> : <Undo2 aria-hidden />}
                  Mark dispute
                </button>

                <div className="splitInputs">
                  <label>
                    Recipient payout
                    <input
                      value={settlementAmount}
                      onChange={(event) => setSettlementAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="0.04"
                    />
                  </label>
                  <label>
                    Memo
                    <input
                      value={settlementMemoHash}
                      onChange={(event) => setSettlementMemoHash(event.target.value)}
                      placeholder="ipfs://settlement-plan"
                      spellCheck={false}
                    />
                  </label>
                </div>

                <button
                  className="button action"
                  type="button"
                  disabled={!isConnected || !canProposeSettlement || Boolean(pendingAction)}
                  title="Payer or recipient can propose a split settlement for the counterparty to accept."
                  onClick={() => submitSettlement(selectedInvoiceWithBond)}
                >
                  {pendingAction === "proposeSettlement" ? <Loader2 className="spin" aria-hidden /> : <Send aria-hidden />}
                  Propose split
                </button>

                {settlementOpen ? (
                  <div className="proposalBox">
                    <span>Open split proposal</span>
                    <strong>{formatSettlement(selectedInvoiceWithBond)}</strong>
                    <button
                      className="button primary"
                      type="button"
                      disabled={!isConnected || !canAcceptSettlement || Boolean(pendingAction)}
                      title="Only the counterparty can accept a settlement proposal."
                      onClick={() => runWrite("acceptSettlement", [selectedInvoiceWithBond.id])}
                    >
                      {pendingAction === "acceptSettlement" ? <Loader2 className="spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
                      Accept split
                    </button>
                    <button
                      className="button action"
                      type="button"
                      disabled={!isConnected || !isSettlementProposer || Boolean(pendingAction)}
                      title="Only the proposer can cancel an open settlement proposal."
                      onClick={() => runWrite("cancelSettlementProposal", [selectedInvoiceWithBond.id])}
                    >
                      {pendingAction === "cancelSettlementProposal" ? <Loader2 className="spin" aria-hidden /> : <Ban aria-hidden />}
                      Cancel split
                    </button>
                  </div>
                ) : null}
              </section>

              <ul className="agentNotes">
	                {agentNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>

              <section className="settlementDesk" aria-label="Agent feedback">
                <div className="splitInputs">
                  <label>
                    Score
                    <input
                      value={feedbackScore}
                      onChange={(event) => setFeedbackScore(event.target.value)}
                      inputMode="numeric"
                      placeholder="90"
                    />
                  </label>
                  <label>
                    Tag
                    <input
                      value={feedbackTag1}
                      onChange={(event) => setFeedbackTag1(event.target.value)}
                      placeholder="settlement"
                      spellCheck={false}
                    />
                  </label>
                </div>
                <div className="splitInputs">
                  <label>
                    Detail tag
                    <input
                      value={feedbackTag2}
                      onChange={(event) => setFeedbackTag2(event.target.value)}
                      placeholder="agent"
                      spellCheck={false}
                    />
                  </label>
                  <label>
                    Feedback URI
                    <input
                      value={feedbackURI}
                      onChange={(event) => setFeedbackURI(event.target.value)}
                      placeholder="ipfs://feedback"
                      spellCheck={false}
                    />
                  </label>
                </div>
                <label>
                  Feedback hash
                  <input
                    value={feedbackHash}
                    onChange={(event) => setFeedbackHash(event.target.value)}
                    placeholder="0x... optional"
                    spellCheck={false}
                  />
                </label>
                <button
                  className="button action"
                  type="button"
                  disabled={!isConnected || !canSubmitFeedback || Boolean(pendingAction)}
                  title="After final settlement, payer reviews service agent and recipient reviews payer agent."
                  onClick={() => submitFeedback(selectedInvoiceWithBond)}
                >
                  {pendingAction === "submitAgentFeedback" ? <Loader2 className="spin" aria-hidden /> : <ShieldCheck aria-hidden />}
                  Submit feedback
                </button>
                <div className="proposalBox">
                  <span>Feedback root</span>
                  <strong>{selectedFeedbackContext && selectedFeedbackContext.root !== zeroHash ? shortHash(selectedFeedbackContext.root) : "none"}</strong>
                  <small>Counterparty feedback is linked to the finalized settlement receipt.</small>
                </div>
              </section>

              <section className="settlementDesk" aria-label="Agent validation">
                <div className="splitInputs">
                  <label>
                    Subject
                    <select
                      value={validationForm.subject}
                      onChange={(event) =>
                        setValidationForm({ ...validationForm, subject: event.target.value as ValidationForm["subject"] })
                      }
                    >
                      <option value="recipient">Service agent</option>
                      <option value="payer">Payer agent</option>
                    </select>
                  </label>
                  <label>
                    Verdict
                    <select
                      value={validationForm.approved ? "approved" : "rejected"}
                      onChange={(event) => setValidationForm({ ...validationForm, approved: event.target.value === "approved" })}
                    >
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                </div>
                <div className="splitInputs">
                  <label>
                    Score
                    <input
                      value={validationForm.score}
                      onChange={(event) => setValidationForm({ ...validationForm, score: event.target.value })}
                      inputMode="numeric"
                      placeholder="92"
                    />
                  </label>
                  <label>
                    Expires
                    <input
                      value={validationForm.expiresHours}
                      onChange={(event) => setValidationForm({ ...validationForm, expiresHours: event.target.value })}
                      inputMode="decimal"
                      placeholder="24"
                    />
                  </label>
                </div>
                <label>
                  Validator agent
                  <input
                    value={validationForm.validatorAgent}
                    onChange={(event) => setValidationForm({ ...validationForm, validatorAgent: event.target.value })}
                    placeholder="erc8004:validator-agent"
                    spellCheck={false}
                  />
                </label>
                <label>
                  Schema
                  <input
                    value={validationForm.schema}
                    onChange={(event) => setValidationForm({ ...validationForm, schema: event.target.value })}
                    placeholder="schema:validation-v1"
                    spellCheck={false}
                  />
                </label>
                <label>
                  Evidence URI
                  <input
                    value={validationForm.evidenceURI}
                    onChange={(event) => setValidationForm({ ...validationForm, evidenceURI: event.target.value })}
                    placeholder="ipfs://validator-attestation"
                    spellCheck={false}
                  />
                </label>
                <div className="splitInputs">
                  <label>
                    Evidence hash
                    <input
                      value={validationForm.evidenceHash}
                      onChange={(event) => setValidationForm({ ...validationForm, evidenceHash: event.target.value })}
                      placeholder="0x... optional"
                      spellCheck={false}
                    />
                  </label>
                  <label>
                    TEE hash
                    <input
                      value={validationForm.teeAttestationHash}
                      onChange={(event) => setValidationForm({ ...validationForm, teeAttestationHash: event.target.value })}
                      placeholder="0x... optional"
                      spellCheck={false}
                    />
                  </label>
                </div>
                <div className="splitInputs">
                  <label>
                    Nonce
                    <input
                      value={validationForm.nonce}
                      onChange={(event) => setValidationForm({ ...validationForm, nonce: event.target.value })}
                      inputMode="numeric"
                      placeholder="1"
                    />
                  </label>
                </div>
                <button
                  className="button action"
                  type="button"
                  disabled={!isConnected || !canSubmitValidation || Boolean(pendingAction)}
                  title="Sign and submit a receipt-bound validator attestation for the selected agent."
                  onClick={() => submitValidation(selectedInvoiceWithBond)}
                >
                  {pendingAction === "submitAgentValidation" ? <Loader2 className="spin" aria-hidden /> : <ShieldCheck aria-hidden />}
                  Submit validation
                </button>
                <div className="proposalBox">
                  <span>Validation root</span>
                  <strong>{selectedValidationContext && selectedValidationContext.root !== zeroHash ? shortHash(selectedValidationContext.root) : "none"}</strong>
                  <small>
                    Subject {shortHash(validationSubjectHash)} · {selectedValidationContext?.count.toString() ?? "0"} receipt-bound attestation
                  </small>
                </div>
              </section>
            </>
          ) : (
            <div className="emptyState">Select an invoice</div>
          )}

          {txHash ? (
            <div className="txBox">
              <span>Last transaction</span>
              <div>
                <code>{shortAddress(txHash)}</code>
                <button className="iconButton" type="button" title="Copy transaction hash" onClick={() => navigator.clipboard.writeText(txHash)}>
                  <Copy aria-hidden />
                </button>
                {explorerBase ? (
                  <a className="iconButton linkButton" href={`${explorerBase}/tx/${txHash}`} target="_blank" rel="noreferrer" title="Open transaction">
                    <ExternalLink aria-hidden />
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {txError ? <div className="errorBox">{txError}</div> : null}
        </aside>
      </div>
    </main>
  );
}

function StatusTile({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "neutral" }) {
  return (
    <div className={`statusTile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ state }: { state: number }) {
  return (
    <span className={`statusBadge state${state}`}>
      <CheckCircle2 aria-hidden />
      {stateLabels[state] ?? "Unknown"}
    </span>
  );
}

function actionIcon(action: AgentAction["id"], pendingAction: string | null) {
  const spinning = pendingAction && pendingAction !== "";
  if (spinning) return <Loader2 className="spin" aria-hidden />;
  if (action === "pay") return <Send aria-hidden />;
  if (action === "release") return <CheckCircle2 aria-hidden />;
  if (action === "acceptSettlement") return <CheckCircle2 aria-hidden />;
  if (action === "requestRefund") return <Undo2 aria-hidden />;
  if (action === "refund") return <RotateCcw aria-hidden />;
  return <Ban aria-hidden />;
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

function toBondContextRecord(raw: unknown): BondContextRecord {
  const value = raw as Record<string, unknown> & readonly unknown[];
  return {
    activeAmount: BigInt(value.activeAmount as bigint | string | number | undefined ?? (value[0] as bigint | undefined) ?? 0n),
    resolvedAmount: BigInt(value.resolvedAmount as bigint | string | number | undefined ?? (value[1] as bigint | undefined) ?? 0n),
    resolvedRecipient: (value.resolvedRecipient ?? value[2] ?? zeroAddress) as `0x${string}`,
    slashed: Boolean(value.slashed ?? value[3] ?? false)
  };
}

function toFeedbackContextRecord(raw: unknown): FeedbackContextRecord {
  const value = raw as Record<string, unknown> & readonly unknown[];
  return {
    count: BigInt(value.count as bigint | string | number | undefined ?? (value[0] as bigint | undefined) ?? 0n),
    root: (value.root ?? value[1] ?? zeroHash) as `0x${string}`
  };
}

function toValidationContextRecord(raw: unknown): ValidationContextRecord {
  const value = raw as Record<string, unknown> & readonly unknown[];
  return {
    count: BigInt(value.count as bigint | string | number | undefined ?? (value[0] as bigint | undefined) ?? 0n),
    root: (value.root ?? value[1] ?? zeroHash) as `0x${string}`
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

function shortAddress(value?: string) {
  if (!value) return "not connected";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function shortHash(value?: string) {
  if (!value) return "missing";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function hashText(value: string) {
  const trimmed = value.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed as `0x${string}`;
  return keccak256(toBytes(trimmed));
}

function hashOrZero(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return zeroHash;
  return hashText(trimmed);
}

function formatAmount(invoice: InvoiceRecord) {
  return formatTokenValue(invoice.amount, invoice.token);
}

function formatTokenValue(value: bigint, token: `0x${string}`) {
  return formatTokenAmount(value, token);
}

function formatSettlement(invoice: InvoiceRecord) {
  return `${formatTokenValue(invoice.settlementRecipientAmount, invoice.token)} to recipient, ${formatTokenValue(
    invoice.amount - invoice.settlementRecipientAmount,
    invoice.token
  )} back`;
}

function formatBondStatus(invoice: InvoiceRecord) {
  if (invoice.serviceBondAmount > 0n) return `${formatTokenValue(invoice.serviceBondAmount, invoice.token)} active`;
  if (invoice.resolvedBondAmount > 0n) return invoice.serviceBondSlashed ? "slashed" : "returned";
  return "none";
}

function formatBondDetail(invoice: InvoiceRecord) {
  if (invoice.serviceBondAmount > 0n) {
    return `${formatTokenValue(invoice.serviceBondAmount, invoice.token)} is locked as provider accountability.`;
  }
  if (invoice.resolvedBondAmount > 0n) {
    return `${formatTokenValue(invoice.resolvedBondAmount, invoice.token)} ${
      invoice.serviceBondSlashed ? "was paid to payer after missed SLA without timely evidence" : "was returned to provider"
    }.`;
  }
  return "Recipient can post an optional bond before final settlement.";
}

function isEthFormToken(token: string) {
  const trimmed = token.trim();
  return !trimmed || trimmed.toLowerCase() === zeroAddress;
}

function formatTimestamp(value: bigint) {
  if (value === 0n) return "open";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(Number(value) * 1000));
}

function formatDuration(value: bigint) {
  const hours = Number(value) / HOUR;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function trimDecimal(value: string) {
  return value.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.split("\n")[0];
  }
  return "Transaction failed.";
}
