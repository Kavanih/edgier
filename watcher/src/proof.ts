import { JsonRpcProvider } from "ethers";
import { chainInfo, blockProver, proofProvider } from "@gluwa/usc-sdk";
import { config } from "./config";

/**
 * Thin wrapper over @gluwa/usc-sdk.
 *
 * Flow, per the Attestcoin SDK docs:
 *   1. find the source-chain block the transaction landed in
 *   2. wait for Creditcoin to attest that height
 *   3. ask the hosted ProofBuilder for the inclusion + continuity proofs
 *   4. hand them to the on-chain verifier
 */
export class ProofClient {
  readonly sourceProvider: JsonRpcProvider;
  readonly creditcoinProvider: JsonRpcProvider;
  private readonly builder: InstanceType<typeof proofProvider.service.ProofBuilder>;

  constructor() {
    this.sourceProvider = new JsonRpcProvider(config.sourceRpcUrl);
    this.creditcoinProvider = new JsonRpcProvider(config.creditcoinRpcUrl);
    this.builder = new proofProvider.service.ProofBuilder(
      config.chainKey,
      config.proofBuilderUrl,
      5000,
    );
  }

  /** Which source chains is Creditcoin attesting right now? */
  async supportedChains() {
    const provider = new chainInfo.PrecompileChainInfoProvider(this.creditcoinProvider);
    return provider.getSupportedChains();
  }

  /**
   * Produce a verifiable proof for one source-chain transaction.
   *
   * NOTE ON LATENCY: attestation is periodic, not instant. `waitUntilHeightAttested`
   * polls (default 15s) and gives up after ~15 minutes. Budget for this in the
   * demo video — the wait is real and it is the honest cost of not trusting an oracle.
   */
  async proveTransaction(txHash: string) {
    const tx = await this.sourceProvider.getTransaction(txHash);
    if (!tx?.blockNumber) throw new Error(`tx ${txHash} not mined yet`);

    console.log(`[proof] tx in source block ${tx.blockNumber}; waiting for attestation…`);
    await this.builder.waitUntilHeightAttested(config.chainKey, tx.blockNumber);
    console.log(`[proof] block ${tx.blockNumber} attested`);

    const result = await this.builder.getProof(txHash);
    if (!result.success || !result.data) {
      throw new Error(`proof generation failed: ${result.error}`);
    }
    return result.data;
  }

  /** Sanity-check a proof against the precompile before spending gas on a claim. */
  async verifyOffChain(data: Awaited<ReturnType<ProofClient["proveTransaction"]>>) {
    const prover = new blockProver.PrecompileBlockProver(this.creditcoinProvider);
    return prover.verifySingle(
      data.chainKey,
      data.headerNumber,
      data.txBytes,
      data.merkleProof,
      data.continuityProof,
    );
  }
}
