import { read } from "./chain";
import { SIG } from "./triggers";

/**
 * Attestcoin proof material, exactly as the proof service returns it and as
 * ClaimVerifier.submitClaim consumes it.
 */
export interface Proof {
  chainKey: number;
  headerNumber: number;
  txIndex: number;
  txBytes: string;
  merkleProof: { root: string; siblings: { hash: string; isLeft: boolean }[] };
  continuityProof: { lowerEndpointDigest: string; roots: string[] };
}

export interface DecodedLog { emitter: string; event: string; [k: string]: unknown }

export interface Verified {
  proofValid: boolean;
  from: string;
  to: string;
  value: string;
  receiptStatus: number;
  logs: DecodedLog[];
}

const NAMES: Record<string, string> = {
  [SIG.UPGRADED]: "Upgraded(address)",
  [SIG.OWNERSHIP_TRANSFERRED]: "OwnershipTransferred(address,address)",
  [SIG.PAUSED]: "Paused(address)",
  [SIG.TRANSFER]: "Transfer(address,address,uint256)",
};
const topicAddr = (t: string) => "0x" + t.slice(26);

/** Fetches a proof via the sidecar (which talks to Creditcoin's proof service). */
export async function fetchProof(chainKey: number, txHash: string): Promise<Proof> {
  const res = await fetch(`/api/proof?chainKey=${chainKey}&tx=${txHash}`);
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

/**
 * Runs the same two calls ClaimVerifier makes — verify on the BlockProver
 * precompile, decode on the EvmV1Decoder — as read-only calls from the browser.
 * On the live network this is the real precompile; a forged blob returns false.
 */
export async function verifyAndDecode(p: Proof): Promise<Verified> {
  const proofValid: boolean = await read.blockProver["verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))"](
    p.chainKey, p.headerNumber, p.txBytes, p.merkleProof, p.continuityProof,
  );
  const [txn, receipt] = await Promise.all([
    read.decoder.decodeCommonTxFields(p.txBytes),
    read.decoder.decodeReceiptFields(p.txBytes),
  ]);
  const logs: DecodedLog[] = (receipt.receiptLogs as { address_: string; topics: string[]; data: string }[]).map((l) => {
    const sig = l.topics[0];
    const out: DecodedLog = { emitter: l.address_, event: NAMES[sig] ?? "unknown" };
    if (sig === SIG.TRANSFER && l.topics.length >= 3) {
      out.from = topicAddr(l.topics[1]); out.to = topicAddr(l.topics[2]);
      out.value = l.data.length >= 66 ? BigInt(l.data.slice(0, 66)).toString() : "0";
    } else if (sig === SIG.UPGRADED && l.topics[1]) {
      out.newImplementation = topicAddr(l.topics[1]);
    }
    return out;
  });
  return {
    proofValid,
    from: txn.from, to: txn.to, value: txn.value.toString(),
    receiptStatus: Number(receipt.receiptStatus),
    logs,
  };
}

/** The shape the AI analyst reads. */
export function describeVerified(v: Verified, sourceBlock: number | bigint, chainKey: number) {
  return {
    provenBy: v.proofValid
      ? "Attestcoin BlockProver precompile returned TRUE for this transaction's inclusion proof"
      : "BlockProver returned FALSE — this data is NOT verified",
    sourceChain: chainKey === 3 ? "Ethereum mainnet" : chainKey === 1 ? "Ethereum Sepolia" : `chainKey ${chainKey}`,
    sourceBlock: sourceBlock.toString(),
    from: v.from, to: v.to, value: v.value,
    receiptStatus: v.receiptStatus,
    receiptStatusMeaning: v.receiptStatus === 1 ? "succeeded" : "REVERTED — matches nothing",
    logs: v.logs,
  };
}
