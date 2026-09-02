// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CoverPool} from "./CoverPool.sol";
import {TriggerLib} from "./triggers/TriggerLib.sol";
import {IChainInfo} from "./interfaces/IAttestcoin.sol";

/// @title PolicyManager
/// @notice Sells parametric cover written against a contract on Ethereum.
/// @dev Holds no settlement logic of its own — only the ClaimVerifier, which
///      settles against an Attestcoin proof, may mark a policy claimed.
contract PolicyManager is Ownable {
    using TriggerLib for TriggerLib.Trigger;

    enum Status { NONE, ACTIVE, CLAIMED, EXPIRED }

    struct Policy {
        address holder;
        uint256 coverAmount;
        uint256 premiumPaid;
        // Coverage window is expressed in SOURCE CHAIN block numbers, so that a
        // claim's validity is decided by the same proof that decides the loss.
        uint256 startBlock;
        uint256 endBlock;
        TriggerLib.Trigger trigger;
        Status status;
    }

    CoverPool public immutable pool;
    address public claimVerifier;

    /// @dev Creditcoin's view of source-chain attestation state. Used so that
    ///      expiry is decided by attested facts rather than by the caller.
    IChainInfo public immutable chainInfo;

    uint256 public nextPolicyId = 1;
    mapping(uint256 => Policy) private _policies;

    // --- pricing ----------------------------------------------------------
    //
    // Cover is a claim on scarce pool capital, so it is priced like one: a
    // kinked utilisation curve, the same shape as an Aave interest-rate model.
    //
    //   utilisation u = (locked + thisPolicy) / totalAssets
    //
    //   u <= kink :  rate = base + slope1 * (u / kink)
    //   u >  kink :  rate = base + slope1 + slope2 * (u - kink) / (1 - kink)
    //
    // Utilisation is measured AFTER reserving this policy's cover, so a buyer
    // taking the last of the capacity pays for taking it. That both rations
    // scarce capacity and pays underwriters most precisely when their capital
    // is scarcest.

    /// @notice Annualised floor rate in basis points, per trigger kind.
    /// @dev The kind-specific part of the price: how dangerous this event is,
    ///      independent of how much capacity is left.
    mapping(TriggerLib.Kind => uint256) public baseRateBps;

    /// @notice Utilisation at which the curve steepens, in WAD (0.8e18 = 80%).
    uint256 public kinkWad = 0.8e18;
    /// @notice Basis points added across the whole gentle segment (0 … kink).
    uint256 public slope1Bps = 200;
    /// @notice Basis points added across the steep segment (kink … 100%).
    uint256 public slope2Bps = 2_000;

    uint256 public constant BPS = 10_000;
    uint256 public constant WAD = 1e18;
    uint256 public constant BLOCKS_PER_YEAR = 2_628_000; // ~12s Ethereum blocks

    event PolicyBought(uint256 indexed policyId, address indexed holder, uint256 coverAmount, uint256 premium);
    event PolicyClaimed(uint256 indexed policyId, address indexed holder, uint256 payout, bytes32 txId);
    event PolicyExpired(uint256 indexed policyId);
    event ClaimVerifierSet(address indexed verifier);
    event BaseRateSet(TriggerLib.Kind kind, uint256 bps);
    event CurveSet(uint256 kinkWad, uint256 slope1Bps, uint256 slope2Bps);

    error NotClaimVerifier();
    error PolicyNotActive();
    error BadWindow();
    error ZeroCover();
    error NotYetExpired(uint64 attestedHeight, uint256 endBlock);
    error NoAttestation();
    error BadCurve();
    error PremiumAboveMax(uint256 premium, uint256 maxPremium);

    modifier onlyClaimVerifier() {
        if (msg.sender != claimVerifier) revert NotClaimVerifier();
        _;
    }

    constructor(CoverPool pool_, IChainInfo chainInfo_, address owner_) Ownable(owner_) {
        pool = pool_;
        chainInfo = chainInfo_;
        baseRateBps[TriggerLib.Kind.ADMIN_UPGRADE]   = 500; // 5%  annualised floor
        baseRateBps[TriggerLib.Kind.EMERGENCY_PAUSE] = 300; // 3%
        baseRateBps[TriggerLib.Kind.LARGE_OUTFLOW]   = 800; // 8%
    }

    function setClaimVerifier(address v) external onlyOwner {
        claimVerifier = v;
        emit ClaimVerifierSet(v);
    }

    function setBaseRate(TriggerLib.Kind kind, uint256 bps) external onlyOwner {
        baseRateBps[kind] = bps;
        emit BaseRateSet(kind, bps);
    }

    function setCurve(uint256 kinkWad_, uint256 slope1Bps_, uint256 slope2Bps_) external onlyOwner {
        // A kink of 0 or 100% collapses one of the segments and divides by zero.
        if (kinkWad_ == 0 || kinkWad_ >= WAD) revert BadCurve();
        kinkWad = kinkWad_;
        slope1Bps = slope1Bps_;
        slope2Bps = slope2Bps_;
        emit CurveSet(kinkWad_, slope1Bps_, slope2Bps_);
    }

    function policies(uint256 id) external view returns (Policy memory) {
        return _policies[id];
    }

    // --- quoting ----------------------------------------------------------

    /// @notice Pool utilisation once `extraLocked` more capital is reserved, in WAD.
    /// @dev Returns 100% for an empty or fully-committed pool, which prices the
    ///      last of the capacity at the top of the curve rather than dividing by zero.
    function utilisationAfter(uint256 extraLocked) public view returns (uint256) {
        uint256 assets = pool.totalAssets();
        if (assets == 0) return WAD;

        uint256 locked = pool.lockedCapacity() + extraLocked;
        if (locked >= assets) return WAD;

        return (locked * WAD) / assets;
    }

    /// @notice Annualised rate in basis points for this cover, at today's utilisation.
    function rateFor(TriggerLib.Kind kind, uint256 coverAmount) public view returns (uint256) {
        uint256 u = utilisationAfter(coverAmount);
        uint256 kink = kinkWad;

        if (u <= kink) {
            return baseRateBps[kind] + (slope1Bps * u) / kink;
        }
        return baseRateBps[kind] + slope1Bps + (slope2Bps * (u - kink)) / (WAD - kink);
    }

    /// @notice Premium for a given cover amount over a window of source-chain blocks.
    function quote(TriggerLib.Kind kind, uint256 coverAmount, uint256 blocks_)
        public
        view
        returns (uint256)
    {
        return (coverAmount * rateFor(kind, coverAmount) * blocks_) / (BPS * BLOCKS_PER_YEAR);
    }

    // --- buying -----------------------------------------------------------

    /// @notice Buy cover. Reserves capital in the pool and pulls the premium.
    /// @param maxPremium slippage guard. The quote moves with pool utilisation,
    ///        so a policy bought in the same block as someone else's can cost
    ///        more than the price the buyer was shown. Pass `type(uint256).max`
    ///        to accept any price.
    function buyPolicy(
        TriggerLib.Trigger calldata trigger,
        uint256 coverAmount,
        uint256 startBlock,
        uint256 endBlock,
        uint256 maxPremium
    ) external returns (uint256 policyId) {
        if (coverAmount == 0) revert ZeroCover();
        if (endBlock <= startBlock) revert BadWindow();

        uint256 premium = quote(trigger.kind, coverAmount, endBlock - startBlock);
        if (premium > maxPremium) revert PremiumAboveMax(premium, maxPremium);

        pool.lockCapacity(coverAmount);
        pool.collectPremium(msg.sender, premium);

        policyId = nextPolicyId++;
        _policies[policyId] = Policy({
            holder: msg.sender,
            coverAmount: coverAmount,
            premiumPaid: premium,
            startBlock: startBlock,
            endBlock: endBlock,
            trigger: trigger,
            status: Status.ACTIVE
        });

        emit PolicyBought(policyId, msg.sender, coverAmount, premium);
    }

    // --- settlement -------------------------------------------------------

    /// @notice Settle a policy. Reachable only once an Attestcoin proof has verified.
    /// @param txId identity of the proven transaction, for the event trail.
    function settle(uint256 policyId, bytes32 txId) external onlyClaimVerifier {
        Policy storage p = _policies[policyId];
        if (p.status != Status.ACTIVE) revert PolicyNotActive();

        p.status = Status.CLAIMED;
        uint256 payout = p.coverAmount;

        pool.payClaim(p.holder, payout);
        emit PolicyClaimed(policyId, p.holder, payout, txId);
    }

    /// @notice Release reserved capital once the coverage window has demonstrably
    ///         passed without a loss. Permissionless.
    /// @dev The source-chain height is read from the ChainInfo precompile, not
    ///      supplied by the caller. An earlier version trusted a caller-provided
    ///      height, which let anyone free an underwriter's capital early by
    ///      lying about it.
    function expire(uint256 policyId) external {
        Policy storage p = _policies[policyId];
        if (p.status != Status.ACTIVE) revert PolicyNotActive();

        IChainInfo.AttestedPoint memory latest =
            chainInfo.get_latest_attestation_height_and_hash(p.trigger.chainKey);
        if (!latest.exists) revert NoAttestation();
        if (latest.height <= p.endBlock) revert NotYetExpired(latest.height, p.endBlock);

        p.status = Status.EXPIRED;
        pool.releaseCapacity(p.coverAmount);
        emit PolicyExpired(policyId);
    }
}
