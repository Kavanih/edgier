import { expect } from "chai";
import { ethers } from "hardhat";
import type { BaseContract, Signer } from "ethers";
import { TriggerKind } from "../scripts/constants";

/** ethers v6 widens `.connect()` to BaseContract; this keeps the typed surface. */
const as = <T extends BaseContract>(c: T, signer: Signer): T => c.connect(signer) as T;

/**
 * Covers the settlement path with the Attestcoin precompile mocked.
 *
 * What is asserted here is the part AttestCover owns: that a policy pays out
 * exactly when a *successful* proven transaction emitted the insured event, and
 * never otherwise.
 */
describe("AttestCover settlement", () => {
  const COVER = ethers.parseEther("1000");
  const SEPOLIA_CHAINKEY = 1;
  const INSURED = "0x00000000000000000000000000000000000000A1";

  const SIG_UPGRADED = ethers.id("Upgraded(address)");
  const SIG_PAUSED = ethers.id("Paused(address)");
  const SIG_TRANSFER = ethers.id("Transfer(address,address,uint256)");

  const emptyMerkle = { root: ethers.ZeroHash, siblings: [] };
  const emptyContinuity = { lowerEndpointDigest: ethers.ZeroHash, roots: [] };

  async function deploy() {
    const [owner, underwriter, buyer, stranger] = await ethers.getSigners();

    const usd = await ethers.deployContract("MockUSD");
    const pool = await ethers.deployContract("CoverPool", [await usd.getAddress(), owner.address]);
    const chainInfo = await ethers.deployContract("MockChainInfo");
    const pm = await ethers.deployContract("PolicyManager", [
      await pool.getAddress(), await chainInfo.getAddress(), owner.address,
    ]);
    const prover = await ethers.deployContract("MockBlockProver");
    const decoder = await ethers.deployContract("MockEvmV1Decoder");
    const verifier = await ethers.deployContract("ClaimVerifier", [
      await pm.getAddress(), await decoder.getAddress(), await prover.getAddress(),
    ]);

    await pool.setPolicyManager(await pm.getAddress());
    await pm.setClaimVerifier(await verifier.getAddress());

    await usd.mint(underwriter.address, ethers.parseEther("100000"));
    await as(usd, underwriter).approve(await pool.getAddress(), ethers.MaxUint256);
    await as(pool, underwriter).deposit(ethers.parseEther("50000"), underwriter.address);

    await usd.mint(buyer.address, ethers.parseEther("10000"));
    await as(usd, buyer).approve(await pool.getAddress(), ethers.MaxUint256);

    return { owner, underwriter, buyer, stranger, usd, pool, pm, prover, decoder, verifier, chainInfo };
  }

  /** Builds the blob the MockEvmV1Decoder understands: tx fields + receipt. */
  function encodeBlob(
    opts: {
      to?: string;
      status?: number;
      logs?: { address_: string; topics: string[]; data: string }[];
    } = {},
  ) {
    const txn = {
      nonce: 0n, gasLimit: 21000n,
      from: ethers.ZeroAddress,
      toIsNull: false,
      to: opts.to ?? INSURED,
      value: 0n,
      data: "0x",
    };
    const receipt = {
      receiptStatus: opts.status ?? 1,
      receiptGasUsed: 21000n,
      receiptLogs: opts.logs ?? [],
      receiptLogsBloom: "0x",
    };
    return ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "tuple(uint64 nonce, uint64 gasLimit, address from, bool toIsNull, address to, uint256 value, bytes data)",
        "tuple(uint8 receiptStatus, uint64 receiptGasUsed, tuple(address address_, bytes32[] topics, bytes data)[] receiptLogs, bytes receiptLogsBloom)",
      ],
      [txn, receipt],
    );
  }

  const upgradedLog = (emitter = INSURED) => ({
    address_: emitter,
    topics: [SIG_UPGRADED, ethers.zeroPadValue("0x00000000000000000000000000000000000000de", 32)],
    data: "0x",
  });

  const transferLog = (from: string, value: bigint, emitter = INSURED) => ({
    address_: emitter,
    topics: [
      SIG_TRANSFER,
      ethers.zeroPadValue(from, 32),
      ethers.zeroPadValue("0x00000000000000000000000000000000000000ff", 32),
    ],
    data: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [value]),
  });

  async function buyCover(
    f: Awaited<ReturnType<typeof deploy>>,
    kind: TriggerKind,
    threshold = 0n,
  ) {
    await as(f.pm, f.buyer).buyPolicy(
      { chainKey: SEPOLIA_CHAINKEY, target: INSURED, kind, threshold },
      COVER, 100n, 200n,
    );
    return 1n;
  }

  it("pays out when a proven transaction emitted the insured event", async () => {
    const f = await deploy();
    const id = await buyCover(f, TriggerKind.ADMIN_UPGRADE);
    const before = await f.usd.balanceOf(f.buyer.address);

    await f.verifier.submitClaim(
      id, 150n, encodeBlob({ logs: [upgradedLog()] }), emptyMerkle, emptyContinuity,
    );

    expect(await f.usd.balanceOf(f.buyer.address)).to.equal(before + COVER);
    expect((await f.pm.policies(id)).status).to.equal(2); // CLAIMED
  });

  it("does NOT pay out when the transaction reverted", async () => {
    const f = await deploy();
    const id = await buyCover(f, TriggerKind.ADMIN_UPGRADE);

    // Included, but failed. Inclusion is not success.
    await expect(
      f.verifier.submitClaim(
        id, 150n, encodeBlob({ status: 0, logs: [upgradedLog()] }), emptyMerkle, emptyContinuity,
      ),
    ).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");
  });

  it("ignores the insured event emitted by a different contract", async () => {
    const f = await deploy();
    const id = await buyCover(f, TriggerKind.ADMIN_UPGRADE);
    const impostor = "0x00000000000000000000000000000000000000bb";

    await expect(
      f.verifier.submitClaim(
        id, 150n, encodeBlob({ logs: [upgradedLog(impostor)] }), emptyMerkle, emptyContinuity,
      ),
    ).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");
  });

  it("lets anyone submit the claim, not just the policyholder", async () => {
    const f = await deploy();
    const id = await buyCover(f, TriggerKind.ADMIN_UPGRADE);

    await expect(
      as(f.verifier, f.stranger).submitClaim(
        id, 150n, encodeBlob({ logs: [upgradedLog()] }), emptyMerkle, emptyContinuity,
      ),
    ).to.emit(f.pm, "PolicyClaimed");
  });

  it("rejects a transaction outside the coverage window", async () => {
    const f = await deploy();
    const id = await buyCover(f, TriggerKind.ADMIN_UPGRADE);

    await expect(
      f.verifier.submitClaim(
        id, 999n, encodeBlob({ logs: [upgradedLog()] }), emptyMerkle, emptyContinuity,
      ),
    ).to.be.revertedWithCustomError(f.verifier, "OutsideCoverageWindow");
  });

  it("rejects a claim the Attestcoin proof does not support", async () => {
    const f = await deploy();
    const id = await buyCover(f, TriggerKind.ADMIN_UPGRADE);
    await f.prover.setResult(false);

    await expect(
      f.verifier.submitClaim(
        id, 150n, encodeBlob({ logs: [upgradedLog()] }), emptyMerkle, emptyContinuity,
      ),
    ).to.be.revertedWithCustomError(f.verifier, "ProofRejected");
  });

  it("distinguishes trigger kinds", async () => {
    const f = await deploy();
    const id = await buyCover(f, TriggerKind.EMERGENCY_PAUSE);

    // An upgrade does not satisfy pause cover.
    await expect(
      f.verifier.submitClaim(
        id, 150n, encodeBlob({ logs: [upgradedLog()] }), emptyMerkle, emptyContinuity,
      ),
    ).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");

    const pausedLog = { address_: INSURED, topics: [SIG_PAUSED], data: "0x" };
    await expect(
      f.verifier.submitClaim(
        id, 150n, encodeBlob({ logs: [pausedLog] }), emptyMerkle, emptyContinuity,
      ),
    ).to.emit(f.pm, "PolicyClaimed");
  });

  it("enforces the LARGE_OUTFLOW threshold and direction", async () => {
    const f = await deploy();
    const id = await buyCover(f, TriggerKind.LARGE_OUTFLOW, ethers.parseEther("100"));

    // Below threshold.
    await expect(
      f.verifier.submitClaim(
        id, 150n, encodeBlob({ logs: [transferLog(INSURED, ethers.parseEther("1"))] }),
        emptyMerkle, emptyContinuity,
      ),
    ).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");

    // Large, but flowing IN to the insured contract, not out of it.
    const inbound = transferLog("0x00000000000000000000000000000000000000cc", ethers.parseEther("500"));
    await expect(
      f.verifier.submitClaim(id, 150n, encodeBlob({ logs: [inbound] }), emptyMerkle, emptyContinuity),
    ).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");

    // Large and outbound.
    await expect(
      f.verifier.submitClaim(
        id, 150n, encodeBlob({ logs: [transferLog(INSURED, ethers.parseEther("500"))] }),
        emptyMerkle, emptyContinuity,
      ),
    ).to.emit(f.pm, "PolicyClaimed");
  });

  it("will not settle the same policy twice", async () => {
    const f = await deploy();
    const id = await buyCover(f, TriggerKind.ADMIN_UPGRADE);
    const blob = encodeBlob({ logs: [upgradedLog()] });

    await f.verifier.submitClaim(id, 150n, blob, emptyMerkle, emptyContinuity);
    await expect(
      f.verifier.submitClaim(id, 150n, blob, emptyMerkle, emptyContinuity),
    ).to.be.revertedWithCustomError(f.verifier, "AlreadyClaimed");
  });

  it("refuses to expire a policy before the source chain has moved past it", async () => {
    const f = await deploy();
    const id = await buyCover(f, TriggerKind.ADMIN_UPGRADE);

    // Attested height still inside the coverage window.
    await f.chainInfo.setLatest(SEPOLIA_CHAINKEY, 150, true);
    await expect(f.pm.expire(id)).to.be.revertedWithCustomError(f.pm, "NotYetExpired");

    // Capital is still reserved.
    expect(await f.pool.lockedCapacity()).to.equal(COVER);
  });

  it("releases capital once the attested height passes the window", async () => {
    const f = await deploy();
    const id = await buyCover(f, TriggerKind.ADMIN_UPGRADE);

    await f.chainInfo.setLatest(SEPOLIA_CHAINKEY, 250, true);
    await expect(f.pm.expire(id)).to.emit(f.pm, "PolicyExpired");
    expect(await f.pool.lockedCapacity()).to.equal(0n);
  });

  it("locks underwriter capital while a policy is live", async () => {
    const f = await deploy();
    await buyCover(f, TriggerKind.ADMIN_UPGRADE);

    expect(await f.pool.lockedCapacity()).to.equal(COVER);
    expect(await f.pool.maxWithdraw(f.underwriter.address))
      .to.be.lte(await f.pool.freeCapacity());
  });
});
