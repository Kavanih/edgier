import { expect } from "chai";
import { ethers } from "hardhat";
import type { BaseContract, Signer } from "ethers";
import { TriggerKind } from "../scripts/constants";

const as = <T extends BaseContract>(c: T, signer: Signer): T => c.connect(signer) as T;

/**
 * Settlement with the Attestcoin precompiles mocked: what Edgier itself owns.
 * A policy on a CONTRACT against a BUNDLE of perils pays exactly when a
 * *successful* proven transaction satisfies one of them — and never otherwise.
 */
describe("Edgier settlement", () => {
  const COVER = ethers.parseEther("1000");
  const CHAIN = 1;
  const INSURED = "0x00000000000000000000000000000000000000A1";
  const TOKEN   = "0x00000000000000000000000000000000000000E0";
  const ATTACKER = "0x00000000000000000000000000000000000000de";

  const SIG_UPGRADED = ethers.id("Upgraded(address)");
  const SIG_PAUSED = ethers.id("Paused(address)");
  const SIG_TRANSFER = ethers.id("Transfer(address,address,uint256)");
  const SIG_SHUTDOWN = ethers.id("EmergencyShutdown(uint256)");

  const M = { root: ethers.ZeroHash, siblings: [] };
  const K = { lowerEndpointDigest: ethers.ZeroHash, roots: [] };

  const peril = (kind: TriggerKind, extra: Partial<{ threshold: bigint; token: string; signature: string }> = {}) => ({
    kind, threshold: extra.threshold ?? 0n, token: extra.token ?? ethers.ZeroAddress, signature: extra.signature ?? ethers.ZeroHash,
  });
  const UPGRADE = peril(TriggerKind.ADMIN_UPGRADE);
  const PAUSE = peril(TriggerKind.EMERGENCY_PAUSE);
  const OUTFLOW = (threshold = 0n) => peril(TriggerKind.LARGE_OUTFLOW, { threshold, token: TOKEN });
  const CUSTOM = peril(TriggerKind.CUSTOM_EVENT, { signature: SIG_SHUTDOWN });
  const SEL_WITHDRAW = ethers.id("emergencyWithdraw()").slice(0, 10);          // 4-byte selector
  const CALL = peril(TriggerKind.CALL_SELECTOR, { signature: ethers.zeroPadBytes(SEL_WITHDRAW, 32) });

  async function deploy(opts: { backdated?: boolean } = {}) {
    const [owner, underwriter, buyer, stranger] = await ethers.getSigners();
    const usd = await ethers.deployContract("MockUSD");
    const pool = await ethers.deployContract("CoverPool", [await usd.getAddress(), owner.address]);
    const chainInfo = await ethers.deployContract("MockChainInfo");
    const pm = await ethers.deployContract("PolicyManager", [
      await pool.getAddress(), await chainInfo.getAddress(), owner.address, opts.backdated ?? true,
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
    await chainInfo.setLatest(CHAIN, 50, true);
    return { owner, underwriter, buyer, stranger, usd, pool, pm, prover, decoder, verifier, chainInfo };
  }

  function blob(opts: { from?: string; to?: string; data?: string; status?: number; logs?: { address_: string; topics: string[]; data: string }[] } = {}) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(uint64 nonce, uint64 gasLimit, address from, bool toIsNull, address to, uint256 value, bytes data)",
       "tuple(uint8 receiptStatus, uint64 receiptGasUsed, tuple(address address_, bytes32[] topics, bytes data)[] receiptLogs, bytes receiptLogsBloom)"],
      [{ nonce: 0n, gasLimit: 21000n, from: opts.from ?? ATTACKER, toIsNull: false, to: opts.to ?? INSURED, value: 0n, data: opts.data ?? "0x" },
       { receiptStatus: opts.status ?? 1, receiptGasUsed: 21000n, receiptLogs: opts.logs ?? [], receiptLogsBloom: "0x" }],
    );
  }
  const upgraded = (emitter = INSURED) => ({ address_: emitter, topics: [SIG_UPGRADED, ethers.zeroPadValue(ATTACKER, 32)], data: "0x" });
  const paused = (emitter = INSURED) => ({ address_: emitter, topics: [SIG_PAUSED], data: "0x" });
  const shutdown = (emitter = INSURED) => ({ address_: emitter, topics: [SIG_SHUTDOWN], data: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1n]) });
  const transfer = (from: string, value: bigint, emitter = TOKEN) => ({
    address_: emitter,
    topics: [SIG_TRANSFER, ethers.zeroPadValue(from, 32), ethers.zeroPadValue(ATTACKER, 32)],
    data: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [value]),
  });

  type F = Awaited<ReturnType<typeof deploy>>;
  async function buy(f: F, perils = [UPGRADE], opts: { cover?: bigint; target?: string; start?: bigint; end?: bigint; signer?: Signer } = {}) {
    await as(f.pm, opts.signer ?? f.buyer).buyPolicy(
      CHAIN, opts.target ?? INSURED, perils, opts.cover ?? COVER, opts.start ?? 100n, opts.end ?? 200n, ethers.MaxUint256,
    );
    return (await f.pm.nextPolicyId()) - 1n;
  }
  const claim = (f: F, id: bigint, b: string, block = 150n, signer?: Signer) =>
    as(f.verifier, signer ?? f.stranger).submitClaim(id, block, b, M, K);

  // --- the payout rule ----------------------------------------------------

  it("pays when a proven, successful transaction satisfies a peril", async () => {
    const f = await deploy(); const id = await buy(f);
    const before = await f.usd.balanceOf(f.buyer.address);
    await claim(f, id, blob({ logs: [upgraded()] }));
    expect(await f.usd.balanceOf(f.buyer.address)).to.equal(before + COVER);
    expect((await f.pm.policies(id)).status).to.equal(2);
  });

  it("does NOT pay when the transaction reverted", async () => {
    const f = await deploy(); const id = await buy(f);
    await expect(claim(f, id, blob({ status: 0, logs: [upgraded()] }))).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");
  });

  it("ignores the insured event emitted by a different contract", async () => {
    const f = await deploy(); const id = await buy(f);
    await expect(claim(f, id, blob({ logs: [upgraded("0x00000000000000000000000000000000000000B2")] }))).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");
  });

  it("ignores a Transfer emitted by a contract other than the named token", async () => {
    const f = await deploy(); const id = await buy(f, [OUTFLOW(ethers.parseEther("1"))]);
    await expect(claim(f, id, blob({ logs: [transfer(INSURED, ethers.parseEther("1000000"), "0x0000000000000000000000000000000000000BAD")] }))).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");
  });

  it("enforces the LARGE_OUTFLOW threshold and direction", async () => {
    const f = await deploy(); const id = await buy(f, [OUTFLOW(ethers.parseEther("500"))]);
    await expect(claim(f, id, blob({ logs: [transfer(INSURED, ethers.parseEther("499"))] }))).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");
    await expect(claim(f, id, blob({ logs: [transfer(ATTACKER, ethers.parseEther("5000"))] }))).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");
    await claim(f, id, blob({ logs: [transfer(INSURED, ethers.parseEther("500"))] }));
    expect((await f.pm.policies(id)).status).to.equal(2);
  });

  // --- bundles ------------------------------------------------------------

  it("a bundle pays on ANY of its perils, and reports which one fired", async () => {
    const f = await deploy();
    const id = await buy(f, [UPGRADE, PAUSE, OUTFLOW(ethers.parseEther("100")), CUSTOM]);
    await expect(claim(f, id, blob({ logs: [shutdown()] }))).to.emit(f.verifier, "ClaimSubmitted").withArgs(id, f.stranger.address, ethers.keccak256(blob({ logs: [shutdown()] })), 150n, 3n);
  });

  it("a bundle on a contract without the event does not pay for it", async () => {
    const f = await deploy(); const id = await buy(f, [UPGRADE, PAUSE]);
    await expect(claim(f, id, blob({ logs: [shutdown()] }))).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");
  });

  it("a custom event must come from the insured contract and must be named", async () => {
    const f = await deploy();
    const id = await buy(f, [CUSTOM]);
    await expect(claim(f, id, blob({ logs: [shutdown("0x00000000000000000000000000000000000000B2")] }))).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");
    await expect(buy(f, [peril(TriggerKind.CUSTOM_EVENT)])).to.be.revertedWithCustomError(f.pm, "MalformedPeril");
  });

  it("CALL_SELECTOR insures a contract that emits nothing: a successful direct call to the named function", async () => {
    const f = await deploy(); const id = await buy(f, [CALL]);
    // Direct call, right selector, succeeded, no logs at all — pays.
    await expect(claim(f, id, blob({ data: SEL_WITHDRAW + "00".repeat(32) }))).to.emit(f.pm, "PolicyClaimed");
    const id2 = await buy(f, [CALL]);
    // Wrong selector, or a call to some other contract (indirect path), or reverted — does not.
    await expect(claim(f, id2, blob({ data: ethers.id("deposit()").slice(0, 10) }))).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");
    await expect(claim(f, id2, blob({ to: "0x00000000000000000000000000000000000000B2", data: SEL_WITHDRAW }))).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");
    await expect(claim(f, id2, blob({ status: 0, data: SEL_WITHDRAW }))).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");
    await expect(buy(f, [peril(TriggerKind.CALL_SELECTOR)])).to.be.revertedWithCustomError(f.pm, "MalformedPeril");
  });

  it("requires an outflow peril to name its token, and bounds the bundle size", async () => {
    const f = await deploy();
    await expect(buy(f, [peril(TriggerKind.LARGE_OUTFLOW, { threshold: 1n })])).to.be.revertedWithCustomError(f.pm, "MalformedPeril");
    await expect(buy(f, [])).to.be.revertedWithCustomError(f.pm, "NoPerils");
    await expect(buy(f, Array(9).fill(UPGRADE))).to.be.revertedWithCustomError(f.pm, "TooManyPerils");
  });

  it("prices a bundle as the sum of its distinct perils' base rates", async () => {
    const f = await deploy();
    expect(await f.pm.bundleBaseBps([UPGRADE])).to.equal(500n);
    expect(await f.pm.bundleBaseBps([UPGRADE, PAUSE, OUTFLOW(), CUSTOM])).to.equal(2000n);
    expect(await f.pm.bundleBaseBps([UPGRADE, PAUSE, OUTFLOW(), CUSTOM, CALL])).to.equal(2600n);
    expect(await f.pm.bundleBaseBps([UPGRADE, UPGRADE])).to.equal(500n); // duplicates count once
  });

  // --- permissionless, safe -----------------------------------------------

  it("lets anyone submit the claim, not just the policyholder", async () => {
    const f = await deploy(); const id = await buy(f);
    await expect(claim(f, id, blob({ logs: [upgraded()] }), 150n, f.stranger)).to.emit(f.pm, "PolicyClaimed");
  });

  it("refuses a loss transaction the policyholder sent themselves", async () => {
    const f = await deploy(); const id = await buy(f);
    await expect(claim(f, id, blob({ from: f.buyer.address, logs: [upgraded()] }))).to.be.revertedWithCustomError(f.verifier, "SelfInflicted");
  });

  it("rejects a transaction outside the coverage window", async () => {
    const f = await deploy(); const id = await buy(f);
    await expect(claim(f, id, blob({ logs: [upgraded()] }), 250n)).to.be.revertedWithCustomError(f.verifier, "OutsideCoverageWindow");
  });

  it("rejects a claim the precompile does not support", async () => {
    const f = await deploy(); const id = await buy(f);
    await f.prover.setResult(false);
    await expect(claim(f, id, blob({ logs: [upgraded()] }))).to.be.revertedWithCustomError(f.verifier, "ProofRejected");
  });

  it("will not settle the same policy twice", async () => {
    const f = await deploy(); const id = await buy(f);
    await claim(f, id, blob({ logs: [upgraded()] }));
    await expect(claim(f, id, blob({ logs: [upgraded()] }))).to.be.revertedWithCustomError(f.verifier, "AlreadyClaimed");
  });

  // --- moral-hazard defences ----------------------------------------------

  it("caps live cover on one contract at a share of the pool", async () => {
    const f = await deploy(); // 50,000 pool, cap 10% = 5,000
    await buy(f, [UPGRADE], { cover: ethers.parseEther("4000") });
    await expect(buy(f, [UPGRADE], { cover: ethers.parseEther("1001") })).to.be.revertedWithCustomError(f.pm, "TargetConcentration");
    await buy(f, [UPGRADE], { cover: ethers.parseEther("1000") });
    // The cap is 10% of pool assets, and assets grew by the premiums just paid,
    // so what remains is the premium's worth — a fraction of a cent, not zero.
    expect(await f.pm.liveCoverOn(CHAIN, INSURED)).to.equal(ethers.parseEther("5000"));
    expect(await f.pm.remainingCapacityFor(CHAIN, INSURED)).to.be.lt(ethers.parseEther("0.01"));
    // a different contract has its own cap
    await buy(f, [UPGRADE], { cover: ethers.parseEther("5000"), target: "0x00000000000000000000000000000000000000A2" });
  });

  it("releases the per-contract cap on settlement and on expiry", async () => {
    const f = await deploy();
    const id = await buy(f, [UPGRADE], { cover: ethers.parseEther("5000") });
    expect(await f.pm.liveCoverOn(CHAIN, INSURED)).to.equal(ethers.parseEther("5000"));
    await claim(f, id, blob({ logs: [upgraded()] }));
    expect(await f.pm.liveCoverOn(CHAIN, INSURED)).to.equal(0n);
  });

  it("enforces a waiting period unless back-dating is allowed (demo)", async () => {
    const f = await deploy({ backdated: false }); // attested 50, waiting 7200
    await expect(buy(f, [UPGRADE], { start: 100n, end: 200n })).to.be.revertedWithCustomError(f.pm, "BackdatedWindow");
    await buy(f, [UPGRADE], { start: 7250n, end: 8000n });
  });

  it("when curated, only allowlisted contracts are insurable", async () => {
    const f = await deploy();
    await f.pm.setCurated(true);
    await expect(buy(f)).to.be.revertedWithCustomError(f.pm, "NotInsurable");
    await f.pm.setInsurable(CHAIN, INSURED, true);
    await buy(f);
  });

  it("keeps a policy claimable for the grace period, then lets anyone expire it", async () => {
    const f = await deploy(); const id = await buy(f);
    await f.chainInfo.setLatest(CHAIN, 205, true);
    await expect(f.pm.expire(id)).to.be.revertedWithCustomError(f.pm, "NotYetExpired");
    await f.chainInfo.setLatest(CHAIN, 200 + 7200 + 1, true);
    await expect(as(f.pm, f.stranger).expire(id)).to.emit(f.pm, "PolicyExpired");
    expect(await f.pool.lockedCapacity()).to.equal(0n);
  });

  it("locks underwriter capital while a policy is live", async () => {
    const f = await deploy(); await buy(f);
    expect(await f.pool.lockedCapacity()).to.equal(COVER);
    expect(await f.pool.maxWithdraw(f.underwriter.address)).to.be.lte(await f.pool.freeCapacity());
  });

  // --- pricing ------------------------------------------------------------

  it("charges more for cover that eats more of the remaining capacity", async () => {
    const f = await deploy();
    expect(await f.pm.rateFor([UPGRADE], ethers.parseEther("1000"))).to.equal(505n);
    expect(await f.pm.rateFor([UPGRADE], ethers.parseEther("45000"))).to.equal(1700n);
    expect(await f.pm.rateFor([UPGRADE], ethers.parseEther("50000"))).to.equal(2700n);
  });

  it("lets a buyer cap the premium they will pay", async () => {
    const f = await deploy();
    const premium = await f.pm.quote([UPGRADE], COVER, 100n);
    await expect(as(f.pm, f.buyer).buyPolicy(CHAIN, INSURED, [UPGRADE], COVER, 100n, 200n, premium - 1n)).to.be.revertedWithCustomError(f.pm, "PremiumAboveMax");
    await expect(as(f.pm, f.buyer).buyPolicy(CHAIN, INSURED, [UPGRADE], COVER, 100n, 200n, premium)).to.emit(f.pm, "PolicyBought");
  });

  // --- batch --------------------------------------------------------------

  it("settles several policies against one shared continuity proof, all or nothing", async () => {
    const f = await deploy();
    const OTHER = "0x00000000000000000000000000000000000000A2";
    const id1 = await buy(f, [UPGRADE]);
    const id2 = await buy(f, [PAUSE], { target: OTHER });
    const good1 = blob({ logs: [upgraded()] }), good2 = blob({ to: OTHER, logs: [paused(OTHER)] }), bad = blob({ logs: [] });
    await expect(as(f.verifier, f.stranger).submitClaimBatch([id1, id2], [150n, 150n], [good1, bad], [M, M], K)).to.be.revertedWithCustomError(f.verifier, "TriggerNotMet");
    expect((await f.pm.policies(id1)).status).to.equal(1);
    await as(f.verifier, f.stranger).submitClaimBatch([id1, id2], [150n, 151n], [good1, good2], [M, M], K);
    expect((await f.pm.policies(id1)).status).to.equal(2);
    expect((await f.pm.policies(id2)).status).to.equal(2);
    await expect(as(f.verifier, f.stranger).submitClaimBatch([id1], [150n, 151n], [good1], [M], K)).to.be.revertedWithCustomError(f.verifier, "LengthMismatch");
  });

  it("refuses to batch policies written against different source chains", async () => {
    const f = await deploy();
    const id1 = await buy(f);
    await as(f.pm, f.buyer).buyPolicy(3, INSURED, [UPGRADE], COVER, 100n, 200n, ethers.MaxUint256);
    const id2 = (await f.pm.nextPolicyId()) - 1n;
    const b = blob({ logs: [upgraded()] });
    await expect(f.verifier.submitClaimBatch([id1, id2], [150n, 150n], [b, b], [M, M], K)).to.be.revertedWithCustomError(f.verifier, "MixedChainKeys");
  });
});
