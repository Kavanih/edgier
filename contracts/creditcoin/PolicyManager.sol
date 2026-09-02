// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CoverPool} from "./CoverPool.sol";
import {TriggerLib} from "./triggers/TriggerLib.sol";
import {IChainInfo, AttestcoinAddresses} from "./interfaces/IAttestcoin.sol";

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

    /// @notice Annualised premium rate in basis points, per trigger kind.
    /// @dev Deliberately crude. Real pricing needs a risk model; a hackathon
    ///      needs a number a judge can follow. Utilisation-based pricing is the
    ///      obvious next step — see docs/PRICING.md.
    mapping(TriggerLib.Kind => uint256) public rateBps;

    uint256 public constant BPS = 10_000;
    uint256 public constant BLOCKS_PER_YEAR = 2_628_000; // ~12s Ethereum blocks

    event PolicyBought(uint256 indexed policyId, address indexed holder, uint256 coverAmount, uint256 premium);
    event PolicyClaimed(uint256 indexed policyId, address indexed holder, uint256 payout, bytes32 txId);
    event PolicyExpired(uint256 indexed policyId);
    event ClaimVerifierSet(address indexed verifier);
    event RateSet(TriggerLib.Kind kind, uint256 bps);

    error NotClaimVerifier();
    error PolicyNotActive();
    error BadWindow();
    error ZeroCover();
    error NotYetExpired(uint64 attestedHeight, uint256 endBlock);
    error NoAttestation();

    modifier onlyClaimVerifier() {
        if (msg.sender != claimVerifier) revert NotClaimVerifier();
        _;
    }

    constructor(CoverPool pool_, IChainInfo chainInfo_, address owner_) Ownable(owner_) {
        pool = pool_;
        chainInfo = chainInfo_;
        rateBps[TriggerLib.Kind.ADMIN_UPGRADE]  = 500; // 5%  annualised
        rateBps[TriggerLib.Kind.EMERGENCY_PAUSE] = 300; // 3%
        rateBps[TriggerLib.Kind.LARGE_OUTFLOW]   = 800; // 8%
    }

    function setClaimVerifier(address v) external onlyOwner {
        claimVerifier = v;
        emit ClaimVerifierSet(v);
    }

    function setRate(TriggerLib.Kind kind, uint256 bps) external onlyOwner {
        rateBps[kind] = bps;
        emit RateSet(kind, bps);
    }

    function policies(uint256 id) external view returns (Policy memory) {
        return _policies[id];
    }

    /// @notice Premium for a given cover amount over a window of source-chain blocks.
    function quote(TriggerLib.Kind kind, uint256 coverAmount, uint256 blocks_)
        public
        view
        returns (uint256)
    {
        return (coverAmount * rateBps[kind] * blocks_) / (BPS * BLOCKS_PER_YEAR);
    }

    /// @notice Buy cover. Reserves capital in the pool and pulls the premium.
    function buyPolicy(
        TriggerLib.Trigger calldata trigger,
        uint256 coverAmount,
        uint256 startBlock,
        uint256 endBlock
    ) external returns (uint256 policyId) {
        if (coverAmount == 0) revert ZeroCover();
        if (endBlock <= startBlock) revert BadWindow();

        uint256 premium = quote(trigger.kind, coverAmount, endBlock - startBlock);

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
