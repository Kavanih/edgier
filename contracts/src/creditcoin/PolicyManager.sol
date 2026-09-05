// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CoverPool} from "./CoverPool.sol";
import {TriggerLib} from "./triggers/TriggerLib.sol";
import {IChainInfo} from "./interfaces/IAttestcoin.sol";

/// @title PolicyManager
/// @notice Sells cover on an EVM contract against a bundle of perils, prices it,
///         and tracks status. Holds no settlement logic — only the ClaimVerifier,
///         which settles against an Attestcoin proof, may mark a policy claimed.
///
/// @dev Moral hazard is the central design problem of parametric cover: the
///      party who controls the insured contract can cause the insured event. A
///      receipt cannot tell an admin's own upgrade from a stolen key's. So the
///      product insures USERS against PROTOCOLS, and this contract carries the
///      four defences that make that workable without a claims committee:
///        - a concentration cap per insured contract (blast radius)
///        - a waiting period before cover starts (no buy-Monday-rug-Tuesday)
///        - an optional owner-curated allowlist of insurable contracts
///        - premiums that rise with pool utilisation
///      The fifth — a loss transaction sent by the policyholder never pays — is
///      enforced in ClaimVerifier, where the transaction's sender is known.
contract PolicyManager is Ownable {
    using TriggerLib for TriggerLib.Peril;

    enum Status { NONE, ACTIVE, CLAIMED, EXPIRED }

    struct Policy {
        address holder;
        uint256 coverAmount;
        uint256 premiumPaid;
        // Coverage window in SOURCE-CHAIN blocks: the proof that shows the loss
        // also shows its block, so timing and substance are decided together.
        uint256 startBlock;
        uint256 endBlock;
        uint64 chainKey;         // Attestcoin source-chain id
        address target;          // the insured contract
        TriggerLib.Peril[] perils;
        Status status;
    }

    CoverPool public immutable pool;
    IChainInfo public immutable chainInfo;
    address public claimVerifier;

    uint256 public nextPolicyId = 1;
    mapping(uint256 => Policy) private _policies;

    // --- moral-hazard defences -------------------------------------------

    /// @notice Demo switch. When true, windows may start in the attested past and
    ///         the waiting period is skipped, so historical incidents can be insured.
    ///         MUST be false in production.
    bool public immutable allowBackdatedCover;

    /// @notice Source-chain blocks after purchase before cover may start.
    uint256 public waitingBlocks = 7_200;               // ~1 day

    /// @notice Blocks after endBlock during which a claim may still be submitted.
    uint256 public constant CLAIM_GRACE_BLOCKS = 7_200; // ~1 day

    /// @notice Maximum live cover on one insured contract, as bps of pool assets.
    uint256 public maxCoverPerTargetBps = 1_000;         // 10%
    mapping(uint64 => mapping(address => uint256)) public liveCoverOn;

    /// @notice When curated, only allowlisted contracts may be insured.
    bool public curated;
    mapping(uint64 => mapping(address => bool)) public insurable;

    // --- pricing ----------------------------------------------------------
    //
    // Kinked utilisation curve, Aave-shaped. Utilisation is measured AFTER
    // reserving this policy's cover, so the buyer taking the last of the
    // capacity pays for taking it. A bundle's base rate is the sum of its
    // distinct perils' base rates: more perils, more premium.

    mapping(TriggerLib.Kind => uint256) public baseRateBps;
    uint256 public kinkWad = 0.8e18;
    uint256 public slope1Bps = 200;
    uint256 public slope2Bps = 2_000;

    uint256 public constant BPS = 10_000;
    uint256 public constant WAD = 1e18;
    uint256 public constant BLOCKS_PER_YEAR = 2_628_000;

    event PolicyBought(uint256 indexed policyId, address indexed holder, uint64 chainKey, address indexed target, uint256 coverAmount, uint256 premium, uint256 perils);
    event PolicyClaimed(uint256 indexed policyId, address indexed holder, uint256 payout, bytes32 txId, uint256 perilIndex);
    event PolicyExpired(uint256 indexed policyId);
    event ClaimVerifierSet(address indexed verifier);
    event BaseRateSet(TriggerLib.Kind kind, uint256 bps);
    event CurveSet(uint256 kinkWad, uint256 slope1Bps, uint256 slope2Bps);
    event LimitsSet(uint256 waitingBlocks, uint256 maxCoverPerTargetBps);
    event CuratedSet(bool curated);
    event InsurableSet(uint64 chainKey, address indexed target, bool insurable);

    error NotClaimVerifier();
    error PolicyNotActive();
    error BadWindow();
    error ZeroCover();
    error NotYetExpired(uint64 attestedHeight, uint256 claimableUntil);
    error NoAttestation();
    error BadCurve();
    error PremiumAboveMax(uint256 premium, uint256 maxPremium);
    error BackdatedWindow(uint256 startBlock, uint256 earliestAllowed);
    error NoPerils();
    error TooManyPerils();
    error MalformedPeril(uint256 index);
    error NotInsurable(uint64 chainKey, address target);
    error TargetConcentration(uint256 wouldBe, uint256 cap);

    modifier onlyClaimVerifier() {
        if (msg.sender != claimVerifier) revert NotClaimVerifier();
        _;
    }

    constructor(CoverPool pool_, IChainInfo chainInfo_, address owner_, bool allowBackdatedCover_)
        Ownable(owner_)
    {
        pool = pool_;
        chainInfo = chainInfo_;
        allowBackdatedCover = allowBackdatedCover_;
        baseRateBps[TriggerLib.Kind.ADMIN_UPGRADE]   = 500;
        baseRateBps[TriggerLib.Kind.EMERGENCY_PAUSE] = 300;
        baseRateBps[TriggerLib.Kind.LARGE_OUTFLOW]   = 800;
        baseRateBps[TriggerLib.Kind.CUSTOM_EVENT]    = 400;
        baseRateBps[TriggerLib.Kind.CALL_SELECTOR]   = 600;
    }

    // --- admin ------------------------------------------------------------

    function setClaimVerifier(address v) external onlyOwner { claimVerifier = v; emit ClaimVerifierSet(v); }
    function setBaseRate(TriggerLib.Kind kind, uint256 bps) external onlyOwner { baseRateBps[kind] = bps; emit BaseRateSet(kind, bps); }
    function setCurve(uint256 kinkWad_, uint256 slope1Bps_, uint256 slope2Bps_) external onlyOwner {
        if (kinkWad_ == 0 || kinkWad_ >= WAD) revert BadCurve();
        kinkWad = kinkWad_; slope1Bps = slope1Bps_; slope2Bps = slope2Bps_;
        emit CurveSet(kinkWad_, slope1Bps_, slope2Bps_);
    }
    function setLimits(uint256 waitingBlocks_, uint256 maxCoverPerTargetBps_) external onlyOwner {
        waitingBlocks = waitingBlocks_; maxCoverPerTargetBps = maxCoverPerTargetBps_;
        emit LimitsSet(waitingBlocks_, maxCoverPerTargetBps_);
    }
    function setCurated(bool on) external onlyOwner { curated = on; emit CuratedSet(on); }
    function setInsurable(uint64 chainKey, address target, bool on) external onlyOwner {
        insurable[chainKey][target] = on; emit InsurableSet(chainKey, target, on);
    }

    // --- views ------------------------------------------------------------

    function policies(uint256 id) external view returns (Policy memory) { return _policies[id]; }

    /// @notice Pool utilisation once `extraLocked` more is reserved, in WAD.
    function utilisationAfter(uint256 extraLocked) public view returns (uint256) {
        uint256 assets = pool.totalAssets();
        if (assets == 0) return WAD;
        uint256 locked = pool.lockedCapacity() + extraLocked;
        if (locked >= assets) return WAD;
        return (locked * WAD) / assets;
    }

    /// @notice Base rate of a bundle: the sum over its DISTINCT peril kinds.
    function bundleBaseBps(TriggerLib.Peril[] memory perils) public view returns (uint256 bps) {
        uint256 seen; // bitmask of kinds
        for (uint256 i = 0; i < perils.length; i++) {
            uint256 bit = 1 << uint256(perils[i].kind);
            if (seen & bit != 0) continue;
            seen |= bit;
            bps += baseRateBps[perils[i].kind];
        }
    }

    /// @notice Annualised rate in bps for this bundle at today's utilisation.
    function rateFor(TriggerLib.Peril[] memory perils, uint256 coverAmount) public view returns (uint256) {
        uint256 u = utilisationAfter(coverAmount);
        uint256 kink = kinkWad;
        uint256 base = bundleBaseBps(perils);
        if (u <= kink) return base + (slope1Bps * u) / kink;
        return base + slope1Bps + (slope2Bps * (u - kink)) / (WAD - kink);
    }

    function quote(TriggerLib.Peril[] memory perils, uint256 coverAmount, uint256 blocks_)
        public view returns (uint256)
    {
        return (coverAmount * rateFor(perils, coverAmount) * blocks_) / (BPS * BLOCKS_PER_YEAR);
    }

    /// @notice The most cover this contract may still take on, given the cap.
    function remainingCapacityFor(uint64 chainKey, address target) public view returns (uint256) {
        uint256 cap = (pool.totalAssets() * maxCoverPerTargetBps) / BPS;
        uint256 live = liveCoverOn[chainKey][target];
        return live >= cap ? 0 : cap - live;
    }

    // --- buying -----------------------------------------------------------

    /// @notice Buy cover on `target` against `perils`; any one firing pays `coverAmount`.
    /// @param maxPremium slippage guard — the quote moves with pool utilisation.
    function buyPolicy(
        uint64 chainKey,
        address target,
        TriggerLib.Peril[] calldata perils,
        uint256 coverAmount,
        uint256 startBlock,
        uint256 endBlock,
        uint256 maxPremium
    ) external returns (uint256 policyId) {
        if (coverAmount == 0) revert ZeroCover();
        if (endBlock <= startBlock) revert BadWindow();
        if (perils.length == 0) revert NoPerils();
        if (perils.length > TriggerLib.MAX_PERILS) revert TooManyPerils();
        for (uint256 i = 0; i < perils.length; i++) {
            if (!perils[i].isWellFormed()) revert MalformedPeril(i);
        }
        if (curated && !insurable[chainKey][target]) revert NotInsurable(chainKey, target);

        // Concentration: one contract may never be the whole pool's problem.
        uint256 cap = (pool.totalAssets() * maxCoverPerTargetBps) / BPS;
        uint256 wouldBe = liveCoverOn[chainKey][target] + coverAmount;
        if (wouldBe > cap) revert TargetConcentration(wouldBe, cap);

        // Waiting period: cover starts no earlier than the attested head plus a
        // buffer, so a loss that is provable today — or planned for tomorrow —
        // cannot be insured today. Skipped only under the demo switch.
        if (!allowBackdatedCover) {
            IChainInfo.AttestedPoint memory latest = chainInfo.get_latest_attestation_height_and_hash(chainKey);
            if (!latest.exists) revert NoAttestation();
            uint256 earliest = uint256(latest.height) + waitingBlocks;
            if (startBlock < earliest) revert BackdatedWindow(startBlock, earliest);
        }

        uint256 premium = quote(perils, coverAmount, endBlock - startBlock);
        if (premium > maxPremium) revert PremiumAboveMax(premium, maxPremium);

        pool.lockCapacity(coverAmount);
        pool.collectPremium(msg.sender, premium);
        liveCoverOn[chainKey][target] = wouldBe;

        policyId = nextPolicyId++;
        Policy storage p = _policies[policyId];
        p.holder = msg.sender;
        p.coverAmount = coverAmount;
        p.premiumPaid = premium;
        p.startBlock = startBlock;
        p.endBlock = endBlock;
        p.chainKey = chainKey;
        p.target = target;
        for (uint256 i = 0; i < perils.length; i++) p.perils.push(perils[i]);
        p.status = Status.ACTIVE;

        emit PolicyBought(policyId, msg.sender, chainKey, target, coverAmount, premium, perils.length);
    }

    // --- settlement -------------------------------------------------------

    /// @notice Settle. Reachable only once an Attestcoin proof has verified.
    function settle(uint256 policyId, bytes32 txId, uint256 perilIndex) external onlyClaimVerifier {
        Policy storage p = _policies[policyId];
        if (p.status != Status.ACTIVE) revert PolicyNotActive();
        p.status = Status.CLAIMED;
        liveCoverOn[p.chainKey][p.target] -= p.coverAmount;
        pool.payClaim(p.holder, p.coverAmount);
        emit PolicyClaimed(policyId, p.holder, p.coverAmount, txId, perilIndex);
    }

    /// @notice Release capital once the window plus grace has demonstrably passed.
    ///         Permissionless; the height comes from the ChainInfo precompile.
    function expire(uint256 policyId) external {
        Policy storage p = _policies[policyId];
        if (p.status != Status.ACTIVE) revert PolicyNotActive();
        IChainInfo.AttestedPoint memory latest = chainInfo.get_latest_attestation_height_and_hash(p.chainKey);
        if (!latest.exists) revert NoAttestation();
        uint256 claimableUntil = p.endBlock + CLAIM_GRACE_BLOCKS;
        if (latest.height <= claimableUntil) revert NotYetExpired(latest.height, claimableUntil);
        p.status = Status.EXPIRED;
        liveCoverOn[p.chainKey][p.target] -= p.coverAmount;
        pool.releaseCapacity(p.coverAmount);
        emit PolicyExpired(policyId);
    }
}
