import { expect } from "chai";
import { ethers } from "hardhat";
import type { BaseContract, Signer } from "ethers";
import { TriggerKind } from "../scripts/constants";

/** ethers v6 widens `.connect()` to BaseContract; this keeps the typed surface. */
const as = <T extends BaseContract>(c: T, signer: Signer): T => c.connect(signer) as T;

/**
 * Covers the settlement path with the Attestcoin precompile mocked.
 *
 * What is asserted here is the part Edgier owns: that a policy pays out
 * exactly when a *successful* proven transaction emitted the insured event, and
 * never otherwise.
 */
describe("Edgier settlement", () => {
  const COVER = ethers.parseEther("1000");
  const SEPOLIA_CHAINKEY = 1;
  const INSURED = "0x00000000000000000000000000000000000000A1";
  const TOKEN = "0x00000000000000000000000000000000000000E0"; // the ERC-20 an outflow policy names

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
      await pool.getAddress(), await chainInfo.getAddress(), owner.address, /* allowBackdatedCover */ true,
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

  const transferLog = (from: string, value: bigint, emitter = TOKEN) => ({
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
    target = INSURED,
  ) {
    await as(f.pm, f.buyer).buyPolicy(
      { chainKey: SEPOLIA_CHAINKEY, target, kind, threshold, token: kind === TriggerKind.LARGE_OUTFLOW ? TOKEN : ethers.ZeroAddress },
      COVER, 100n, 200n, ethers.MaxUint256,
    );
    return (await f.pm.nextPolicyId()) - 1n;
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

    await f.chainInfo.setLatest(SEPOLIA_CHAINKEY, 200 + 7200 + 1, true);
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
  // --- pricing ----------------------------------------------------------

  it("charges more for cover that eats more of the remaining capacity", async () => {
    const f = await deploy(); // pool holds 50,000

    const small = await f.pm.rateFor(TriggerKind.ADMIN_UPGRADE, ethers.parseEther("1000"));
    const large = await f.pm.rateFor(TriggerKind.ADMIN_UPGRADE, ethers.parseEther("45000"));

    // 2% utilisation sits on the gentle segment; 90% is past the kink.
    expect(small).to.equal(505n);  // 500 base + 200 * (0.02 / 0.8)
    expect(large).to.equal(1700n); // 500 base + 200 + 2000 * (0.10 / 0.20)
    expect(large).to.be.gt(small);
  });

  it("prices the last of the capacity at the top of the curve", async () => {
    const f = await deploy();
    // Reserving the entire pool puts utilisation at 100%.
    const full = await f.pm.rateFor(TriggerKind.ADMIN_UPGRADE, ethers.parseEther("50000"));
    expect(full).to.equal(500n + 200n + 2000n);
  });

  it("lets a buyer cap the premium they will pay", async () => {
    const f = await deploy();
    const trigger = {
      chainKey: SEPOLIA_CHAINKEY, target: INSURED,
      kind: TriggerKind.ADMIN_UPGRADE, threshold: 0n, token: ethers.ZeroAddress,
    };
    const premium = await f.pm.quote(TriggerKind.ADMIN_UPGRADE, COVER, 100n);

    await expect(
      as(f.pm, f.buyer).buyPolicy(trigger, COVER, 100n, 200n, premium - 1n),
    ).to.be.revertedWithCustomError(f.pm, "PremiumAboveMax");

    await expect(as(f.pm, f.buyer).buyPolicy(trigger, COVER, 100n, 200n, premium))
      .to.emit(f.pm, "PolicyBought");
  });

  // --- batched settlement ------------------------------------------------

  it("settles several policies against one shared continuity proof", async () => {
    const f = await deploy();
    const OTHER = "0x00000000000000000000000000000000000000A2";

    const id1 = await buyCover(f, TriggerKind.ADMIN_UPGRADE);
    const id2 = await buyCover(f, TriggerKind.EMERGENCY_PAUSE, 0n, OTHER);

    const blob1 = encodeBlob({ logs: [upgradedLog()] });
    const blob2 = encodeBlob({
      to: OTHER,
      logs: [{ address_: OTHER, topics: [SIG_PAUSED], data: "0x" }],
    });

    const before = await f.usd.balanceOf(f.buyer.address);

    await f.verifier.submitClaimBatch(
      [id1, id2], [150n, 151n], [blob1, blob2],
      [emptyMerkle, emptyMerkle], emptyContinuity,
    );

    expect(await f.usd.balanceOf(f.buyer.address)).to.equal(before + COVER * 2n);
    expect((await f.pm.policies(id1)).status).to.equal(2);
    expect((await f.pm.policies(id2)).status).to.equal(2);
  });

  it("rejects a batch whose arrays disagree in length", async () => {
    const f = await deploy();
    const id = await buyCover(f, TriggerKind.ADMIN_UPGRADE);
    const blob = encodeBlob({ logs: [upgradedLog()] });

    await expect(
      f.verifier.submitClaimBatch(
        [id], [150n, 151n], [blob], [emptyMerkle], emptyContinuity,
      ),
    ).to.be.revertedWithCustomError(f.verifier, "LengthMismatch");
  });

  it("refuses to batch policies written against different source chains", async () => {
    const f = await deploy();
    const id1 = await buyCover(f, TriggerKind.ADMIN_UPGRADE);

    await as(f.pm, f.buyer).buyPolicy(
      { chainKey: 3, target: INSURED, kind: TriggerKind.ADMIN_UPGRADE, threshold: 0n, token: ethers.ZeroAddress },
      COVER, 100n, 200n, ethers.MaxUint256,
    );
    const id2 = (await f.pm.nextPolicyId()) - 1n;

    const blob = encodeBlob({ logs: [upgradedLog()] });

    await expect(
      f.verifier.submitClaimBatch(
        [id1, id2], [150n, 150n], [blob, blob],
        [emptyMerkle, emptyMerkle], emptyContinuity,
      ),
    ).to.be.revertedWithCustomError(f.verifier, "MixedChainKeys");
  });

  it("reverts the whole batch when one entry does not meet its trigger", async () => {
    const f = await deploy();
    const id1 = await buyCover(f, TriggerKind.ADMIN_UPGRADE);
    const id2 = await buyCover(f, TriggerKind.ADMIN_UPGRADE);

    const good = encodeBlob({ logs: [upgradedLog()] });
    const bad = encodeBlob({ logs: [] }); // no Upgraded event
    const before = await f.usd.balanceOf(f.buyer.address);

    await expect(
      f.verifier.submitClaimBatch(
        [id1, id2], [150n, 150n], [good, bad],
        [emptyMerkle, emptyMerkle], emptyContinuity,
      ),
    ).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");

    // Nothing paid out — the good entry rolled back with the bad one.
    expect(await f.usd.balanceOf(f.buyer.address)).to.equal(before);
    expect((await f.pm.policies(id1)).status).to.equal(1); // still ACTIVE
  });

  it("rejects a batch the precompile will not verify", async () => {
    const f = await deploy();
    const id = await buyCover(f, TriggerKind.ADMIN_UPGRADE);
    await f.prover.setResult(false);

    await expect(
      f.verifier.submitClaimBatch(
        [id], [150n], [encodeBlob({ logs: [upgradedLog()] })],
        [emptyMerkle], emptyContinuity,
      ),
    ).to.be.revertedWithCustomError(f.verifier, "ProofRejected");
  });
  // --- emitter binding, back-dating, grace --------------------------------

  it("ignores a Transfer emitted by a contract other than the named token", async () => {
    const f = await deploy();
    const id = await buyCover(f, TriggerKind.LARGE_OUTFLOW, ethers.parseEther("1"));
    const IMPOSTOR = "0x0000000000000000000000000000000000000BAD";

    // Right shape, right "from", huge value — wrong emitter. Must not pay.
    await expect(
      f.verifier.submitClaim(
        id, 150n, encodeBlob({ logs: [transferLog(INSURED, ethers.parseEther("1000000"), IMPOSTOR)] }),
        emptyMerkle, emptyContinuity,
      ),
    ).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");
  });

  it("requires an outflow policy to name its token", async () => {
    const f = await deploy();
    await expect(
      as(f.pm, f.buyer).buyPolicy(
        { chainKey: SEPOLIA_CHAINKEY, target: INSURED, kind: TriggerKind.LARGE_OUTFLOW, threshold: 1n, token: ethers.ZeroAddress },
        COVER, 100n, 200n, ethers.MaxUint256,
      ),
    ).to.be.revertedWithCustomError(f.pm, "TokenRequired");
  });

  it("refuses a window in the attested past unless back-dating is allowed", async () => {
    const [owner, , buyer] = await ethers.getSigners();
    const usd = await ethers.deployContract("MockUSD");
    const pool = await ethers.deployContract("CoverPool", [await usd.getAddress(), owner.address]);
    const chainInfo = await ethers.deployContract("MockChainInfo");
    const pm = await ethers.deployContract("PolicyManager", [
      await pool.getAddress(), await chainInfo.getAddress(), owner.address, /* allowBackdatedCover */ false,
    ]);
    await pool.setPolicyManager(await pm.getAddress());
    await usd.mint(buyer.address, ethers.parseEther("10000"));
    await as(usd, buyer).approve(await pool.getAddress(), ethers.MaxUint256);
    await usd.mint(owner.address, ethers.parseEther("100000"));
    await usd.approve(await pool.getAddress(), ethers.MaxUint256);
    await pool.deposit(ethers.parseEther("50000"), owner.address);
    await chainInfo.setLatest(SEPOLIA_CHAINKEY, 1000, true);

    const trigger = { chainKey: SEPOLIA_CHAINKEY, target: INSURED, kind: TriggerKind.ADMIN_UPGRADE, threshold: 0n, token: ethers.ZeroAddress };
    await expect(as(pm, buyer).buyPolicy(trigger, COVER, 900n, 1100n, ethers.MaxUint256))
      .to.be.revertedWithCustomError(pm, "BackdatedWindow");
    await expect(as(pm, buyer).buyPolicy(trigger, COVER, 1000n, 1100n, ethers.MaxUint256))
      .to.emit(pm, "PolicyBought");
  });

  it("keeps a policy claimable for the grace period after its window", async () => {
    const f = await deploy();
    const id = await buyCover(f, TriggerKind.ADMIN_UPGRADE);

    // Attested just past endBlock: a loss at block 199 is provable now, so expiry must wait.
    await f.chainInfo.setLatest(SEPOLIA_CHAINKEY, 205, true);
    await expect(f.pm.expire(id)).to.be.revertedWithCustomError(f.pm, "NotYetExpired");

    await f.verifier.submitClaim(id, 199n, encodeBlob({ logs: [upgradedLog()] }), emptyMerkle, emptyContinuity);
    expect((await f.pm.policies(id)).status).to.equal(2);
  });
});
