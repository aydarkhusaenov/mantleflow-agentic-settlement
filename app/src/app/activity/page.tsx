"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isAddress, parseAbiItem, zeroAddress, zeroHash } from "viem";
import { useChainId, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { invoiceEscrowAbi } from "@/lib/abi";
import { stateLabels } from "@/lib/agent";
import { explorerBaseForChain, hardhat } from "@/lib/chains";
import { formatTokenAmount } from "@/lib/tokens";

const trackedEvents = [
  parseAbiItem("event InvoiceCreated(uint256 indexed invoiceId,address indexed creator,address indexed recipient,address token,uint256 amount,uint64 dueAt,uint64 timeout,string metadataHash)"),
  parseAbiItem("event InvoicePaid(uint256 indexed invoiceId,address indexed payer,address token,uint256 amount)"),
  parseAbiItem("event SettlementReceiptFinalized(uint256 indexed invoiceId,bytes32 indexed receiptHash,uint8 finalState)"),
  parseAbiItem("event AgentFeedbackSubmitted(uint256 indexed invoiceId,address indexed reviewer,bytes32 indexed agentHash,bool recipientAgent,int128 score,string tag1,string tag2,string feedbackURI,bytes32 feedbackHash,bytes32 receiptHash,uint64 feedbackCount,bytes32 feedbackRoot)"),
  parseAbiItem("event AgentValidationSubmitted(uint256 indexed invoiceId,address indexed validator,bytes32 indexed subjectAgentHash,bytes32 validatorAgentHash,bool approved,int128 score,bytes32 schemaHash,string evidenceURI,bytes32 evidenceHash,bytes32 receiptHash,uint64 validationCount,bytes32 validationRoot)")
] as const;

type InvoiceTuple = readonly unknown[] & {
  token?: `0x${string}`;
  amount?: bigint;
  settlementProposedAt?: bigint;
  deliveryEvidenceCount?: bigint;
  disputeMarkedAt?: bigint;
  disputeEvidenceCount?: bigint;
  state?: number;
  settlementRecipientAmount?: bigint;
};

type AgentContextTuple = readonly unknown[] & {
  payerAgentHash?: `0x${string}`;
  recipientAgentHash?: `0x${string}`;
};

type ReputationSummaryTuple = readonly unknown[] & {
  count?: bigint;
  summaryValue?: bigint;
  valueDecimals?: number;
};

type InvoiceRow = {
  id: bigint;
  invoice: InvoiceTuple;
};

type ActivityLog = {
  name: string;
  invoiceId: string;
  transactionHash: `0x${string}`;
  blockNumber: bigint;
};

export default function ActivityPage() {
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const [addressOverride, setAddressOverride] = useState("");
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logError, setLogError] = useState("");

  useEffect(() => {
    setAddressOverride(window.localStorage.getItem("MantleFlow-contract-address") ?? "");
  }, []);

  const contractAddress = useMemo(() => {
    const candidate = addressOverride || process.env.NEXT_PUBLIC_ESCROW_ADDRESS || "";
    return isAddress(candidate) ? (candidate as `0x${string}`) : undefined;
  }, [addressOverride]);

  const explorerBase = explorerBaseForChain(chainId);

  const { data: invoiceCount, refetch: refetchCount } = useReadContract({
    address: contractAddress,
    abi: invoiceEscrowAbi,
    functionName: "invoiceCount",
    query: { enabled: Boolean(contractAddress) }
  });

  const invoiceIds = useMemo(() => {
    const count = Number(invoiceCount ?? 0n);
    return Array.from({ length: Math.min(count, 48) }, (_, index) => BigInt(count - 1 - index));
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

  const { data: invoiceReads, refetch: refetchInvoices } = useReadContracts({
    contracts: invoiceContracts,
    query: { enabled: Boolean(contractAddress && invoiceContracts.length > 0) }
  });

  const agentContextContracts = useMemo(
    () =>
      invoiceIds.map((id) => ({
        address: contractAddress,
        abi: invoiceEscrowAbi,
        functionName: "getAgentContext" as const,
        args: [id] as const
      })),
    [contractAddress, invoiceIds]
  );

  const { data: contextReads, refetch: refetchContexts } = useReadContracts({
    contracts: agentContextContracts,
    query: { enabled: Boolean(contractAddress && agentContextContracts.length > 0) }
  });

  const invoiceRows = useMemo(
    () =>
      (invoiceReads ?? [])
        .map((item, index) =>
          item.status === "success"
            ? {
                id: invoiceIds[index] ?? BigInt(index),
                invoice: item.result as InvoiceTuple
              }
            : undefined
        )
        .filter((item): item is InvoiceRow => Boolean(item)),
    [invoiceIds, invoiceReads]
  );

  const invoices = useMemo(
    () => invoiceRows.map(({ invoice }) => invoice),
    [invoiceRows]
  );

  const agentContexts = useMemo(
    () => (contextReads ?? []).filter((item) => item.status === "success").map((item) => item.result as AgentContextTuple),
    [contextReads]
  );

  const agentHashes = useMemo(() => {
    const seen = new Set<`0x${string}`>();
    for (const context of agentContexts) {
      for (const hash of [agentHashAt(context, "payerAgentHash", 0), agentHashAt(context, "recipientAgentHash", 1)]) {
        if (hash !== zeroHash) seen.add(hash);
      }
    }
    return Array.from(seen);
  }, [agentContexts]);

  const reputationContracts = useMemo(
    () =>
      agentHashes.map((hash) => ({
        address: contractAddress,
        abi: invoiceEscrowAbi,
        functionName: "getAgentReputationSummary" as const,
        args: [hash] as const
      })),
    [agentHashes, contractAddress]
  );

  const { data: reputationReads, refetch: refetchReputations } = useReadContracts({
    contracts: reputationContracts,
    query: { enabled: Boolean(contractAddress && reputationContracts.length > 0) }
  });

  const reputationRows = useMemo(
    () =>
      agentHashes
        .map((hash, index) => {
          const result = reputationReads?.[index];
          const summary = result?.status === "success" ? (result.result as ReputationSummaryTuple) : undefined;
          const count = toBigInt(summary?.count ?? summary?.[0]);
          const score = toBigInt(summary?.summaryValue ?? summary?.[1]);
          const decimals = Number(summary?.valueDecimals ?? summary?.[2] ?? 0);
          return { hash, count, score, decimals };
        })
        .filter((row) => row.count > 0n)
        .sort((a, b) => compareBigInt(b.count, a.count) || compareBigInt(b.score, a.score))
        .slice(0, 6),
    [agentHashes, reputationReads]
  );

  const analytics = useMemo(() => {
    const byState = Array.from({ length: stateLabels.length }, () => 0);
    let active = 0;
    let finalized = 0;
    let disputed = 0;
    let deliveryEvidence = 0n;
    let disputeEvidence = 0n;
    let activeEth = 0n;
    let releasedEth = 0n;
    let refundedEth = 0n;
    let settledRecipientEth = 0n;
    let settledRefundEth = 0n;
    let openSettlementEth = 0n;

    for (const invoice of invoices) {
      const state = invoiceState(invoice);
      const token = invoiceToken(invoice);
      const amount = invoiceAmount(invoice);
      const settlementRecipientAmount = toBigInt(invoice.settlementRecipientAmount ?? invoice[22]);
      const settlementProposedAt = toBigInt(invoice.settlementProposedAt ?? invoice[9]);
      const deliveryEvidenceCount = toBigInt(invoice.deliveryEvidenceCount ?? invoice[11]);
      const disputeEvidenceCount = toBigInt(invoice.disputeEvidenceCount ?? invoice[13]);
      const disputeMarkedAt = toBigInt(invoice.disputeMarkedAt ?? invoice[12]);

      if (state >= 0 && state < byState.length) byState[state] += 1;
      if (state === 1 || state === 2) active += 1;
      if (state >= 3) finalized += 1;
      if (disputeMarkedAt > 0n || disputeEvidenceCount > 0n) disputed += 1;

      deliveryEvidence += deliveryEvidenceCount;
      disputeEvidence += disputeEvidenceCount;

      if (token !== zeroAddress) continue;
      if (state === 1 || state === 2) activeEth += amount;
      if (state === 3) releasedEth += amount;
      if (state === 4) refundedEth += amount;
      if (state === 6) {
        settledRecipientEth += settlementRecipientAmount;
        settledRefundEth += amount > settlementRecipientAmount ? amount - settlementRecipientAmount : 0n;
      }
      if ((state === 1 || state === 2) && settlementProposedAt > 0n) {
        openSettlementEth += settlementRecipientAmount;
      }
    }

    const mandateCount = agentContexts.filter(
      (context) => agentHashAt(context, "payerAgentHash", 0) !== zeroHash || agentHashAt(context, "recipientAgentHash", 1) !== zeroHash
    ).length;

    return {
      active,
      finalized,
      byState,
      disputed,
      disputeRate: invoices.length === 0 ? "0%" : `${Math.round((disputed / invoices.length) * 100)}%`,
      deliveryEvidence,
      disputeEvidence,
      mandateCount,
      activeEth,
      releasedEth,
      refundedEth,
      settledRecipientEth,
      settledRefundEth,
      openSettlementEth,
      finalizedEth: releasedEth + refundedEth + settledRecipientEth + settledRefundEth
    };
  }, [agentContexts, invoices]);

  async function refreshLogs() {
    if (!publicClient || !contractAddress) return;
    setLoadingLogs(true);
    setLogError("");
    try {
      const latest = await publicClient.getBlockNumber();
      const fromBlock = chainId === hardhat.id ? 0n : latest > 200_000n ? latest - 200_000n : 0n;
      const batches = await Promise.all(
        trackedEvents.map(async (event) => {
          const eventLogs = await publicClient.getLogs({ address: contractAddress, event, fromBlock, toBlock: latest });
          return eventLogs.map((log) => ({
            name: String(log.eventName),
            invoiceId: String((log.args as Record<string, unknown>).invoiceId ?? "?"),
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber
          }));
        })
      );
      setLogs(
        batches
          .flat()
          .sort((a, b) => Number(b.blockNumber - a.blockNumber))
          .slice(0, 24)
      );
    } catch (error) {
      setLogError(error instanceof Error ? error.message.split("\n")[0] : "Failed to load event logs.");
    } finally {
      setLoadingLogs(false);
    }
  }

  async function refreshAll() {
    await refetchCount();
    await refetchInvoices();
    await refetchContexts();
    await refetchReputations();
    await refreshLogs();
  }

  useEffect(() => {
    refreshLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, chainId]);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">AF</div>
          <div>
            <h1>MantleFlow Activity</h1>
            <span>Live settlement counters and on-chain proof</span>
          </div>
        </div>
        <button className="button action compactAction" type="button" onClick={refreshAll} disabled={!contractAddress || loadingLogs}>
          <RefreshCw className={loadingLogs ? "spin" : undefined} aria-hidden />
          Refresh
        </button>
      </header>

      <section className="contractBar">
        <label htmlFor="activityContract">Contract</label>
        <input
          id="activityContract"
          value={addressOverride}
          onChange={(event) => {
            setAddressOverride(event.target.value);
            window.localStorage.setItem("MantleFlow-contract-address", event.target.value);
          }}
          placeholder={process.env.NEXT_PUBLIC_ESCROW_ADDRESS || "0x..."}
          spellCheck={false}
        />
        {contractAddress && explorerBase ? (
          <a className="iconButton linkButton" href={`${explorerBase}/address/${contractAddress}`} target="_blank" rel="noreferrer" title="Open contract">
            <ExternalLink aria-hidden />
          </a>
        ) : null}
      </section>

      <section className="summaryRail">
        <Status label="Invoices" value={String(invoiceCount ?? 0n)} />
        <Status label="Active" value={String(analytics.active)} />
        <Status label="Finalized" value={String(analytics.finalized)} />
        <Status label="Dispute Rate" value={analytics.disputeRate} />
        <Status label="ETH Active" value={formatValue(analytics.activeEth, zeroAddress)} />
        <Status label="ETH Finalized" value={formatValue(analytics.finalizedEth, zeroAddress)} />
      </section>

      <section className="insightRail" aria-label="Protocol analytics">
        <div className="insightPanel">
          <span className="eyebrow">Lifecycle mix</span>
          <h2>Invoices by state</h2>
          <div className="metricList">
            {stateLabels.map((label, index) => (
              <MetricRow key={label} label={label} value={String(analytics.byState[index] ?? 0)} />
            ))}
          </div>
        </div>

        <div className="insightPanel">
          <span className="eyebrow">Value flow</span>
          <h2>ETH settlement totals</h2>
          <div className="metricList">
            <MetricRow label="Active escrow" value={formatValue(analytics.activeEth, zeroAddress)} />
            <MetricRow label="Released" value={formatValue(analytics.releasedEth, zeroAddress)} />
            <MetricRow label="Refunded" value={formatValue(analytics.refundedEth, zeroAddress)} />
            <MetricRow label="Settled to recipient" value={formatValue(analytics.settledRecipientEth, zeroAddress)} />
            <MetricRow label="Settled refund" value={formatValue(analytics.settledRefundEth, zeroAddress)} />
            <MetricRow label="Open split offer" value={formatValue(analytics.openSettlementEth, zeroAddress)} />
          </div>
        </div>

        <div className="insightPanel">
          <span className="eyebrow">Agent accountability</span>
          <h2>Reputation leaderboard</h2>
          <div className="metricList">
            <MetricRow label="Mandated invoices" value={String(analytics.mandateCount)} />
            <MetricRow label="Delivery proofs" value={analytics.deliveryEvidence.toString()} />
            <MetricRow label="Dispute proofs" value={analytics.disputeEvidence.toString()} />
            {reputationRows.length === 0 ? <div className="emptyMini">No reputation updates yet</div> : null}
            {reputationRows.map((row) => (
              <MetricRow
                key={row.hash}
                label={shortHash(row.hash)}
                value={`${formatSignedScore(row.score, row.decimals)} avg / ${row.count.toString()} events`}
              />
            ))}
          </div>
        </div>
      </section>

      <div className="workspace activityWorkspace">
        <section className="panel ledgerPanel">
          <div className="panelHeader">
            <div>
              <span className="eyebrow">Recent invoices</span>
              <h2>Settlement states</h2>
            </div>
          </div>
          <div className="invoiceList">
            {!contractAddress ? <div className="emptyState">Set a contract address</div> : null}
            {contractAddress && invoices.length === 0 ? <div className="emptyState">No invoices loaded</div> : null}
            {invoiceRows.map(({ id, invoice }) => {
              const state = Number(invoice.state ?? invoice[16]);
              const token = (invoice.token ?? invoice[3]) as `0x${string}`;
              const amount = BigInt((invoice.amount ?? invoice[4]) as bigint);
              return (
                <div className="invoiceRow staticRow" key={`${id.toString()}-${state}`}>
                  <div>
                    <strong>#{id.toString()}</strong>
                    <span>{String(invoice[17] ?? "")}</span>
                  </div>
                  <div className="invoiceMeta">
                    <span className={`statusBadge state${state}`}>{stateLabels[state] ?? "Unknown"}</span>
                    <span>{formatValue(amount, token)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel agentPanel">
          <div className="panelHeader">
            <div>
              <span className="eyebrow">Event proof</span>
              <h2>Recent contract logs</h2>
            </div>
          </div>
          <div className="invoiceList">
            {logError ? <div className="errorBox">{logError}</div> : null}
            {!logError && logs.length === 0 ? <div className="emptyState">{loadingLogs ? "Loading logs" : "No recent logs"}</div> : null}
            {logs.map((log) => (
              <div className="invoiceRow staticRow" key={`${log.transactionHash}-${log.name}-${log.invoiceId}`}>
                <div>
                  <strong>{log.name}</strong>
                  <span>invoice #{log.invoiceId} · block {log.blockNumber.toString()}</span>
                </div>
                {explorerBase ? (
                  <a className="iconButton linkButton" href={`${explorerBase}/tx/${log.transactionHash}`} target="_blank" rel="noreferrer" title="Open transaction">
                    <ExternalLink aria-hidden />
                  </a>
                ) : (
                  <span>{shortHash(log.transactionHash)}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="statusTile neutral">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="metricRow">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatValue(value: bigint, token: `0x${string}`) {
  return formatTokenAmount(value, token);
}

function formatSignedScore(value: bigint, decimals: number) {
  if (decimals <= 0) return value.toString();
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const fraction = (abs % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

function shortHash(value: string) {
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function toBigInt(value: unknown) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" || typeof value === "string") return BigInt(value || 0);
  return 0n;
}

function compareBigInt(a: bigint, b: bigint) {
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

function invoiceToken(invoice: InvoiceTuple) {
  return (invoice.token ?? invoice[3]) as `0x${string}`;
}

function invoiceAmount(invoice: InvoiceTuple) {
  return toBigInt(invoice.amount ?? invoice[4]);
}

function invoiceState(invoice: InvoiceTuple) {
  return Number(invoice.state ?? invoice[16] ?? 0);
}

function agentHashAt(context: AgentContextTuple, name: "payerAgentHash" | "recipientAgentHash", index: 0 | 1) {
  return (context[name] ?? context[index] ?? zeroHash) as `0x${string}`;
}
