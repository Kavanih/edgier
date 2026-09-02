// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626, ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CoverPool
/// @notice Underwriting capital. Underwriters deposit and receive shares; premiums
///         accrue to the share price, claim payouts reduce it.
/// @dev Lives on Creditcoin. The risk it underwrites lives on Ethereum — that
///      separation is the whole point: cheap capital and logic here, risk there.
contract CoverPool is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    /// @notice Capital reserved against live policies and not withdrawable.
    uint256 public lockedCapacity;

    /// @notice The PolicyManager permitted to lock capacity and pay claims.
    address public policyManager;

    event PolicyManagerSet(address indexed policyManager);
    event CapacityLocked(uint256 amount, uint256 totalLocked);
    event CapacityReleased(uint256 amount, uint256 totalLocked);
    event PremiumCollected(address indexed from, uint256 amount);
    event ClaimPaid(address indexed to, uint256 amount);

    error NotPolicyManager();
    error InsufficientFreeCapacity(uint256 requested, uint256 available);

    modifier onlyPolicyManager() {
        if (msg.sender != policyManager) revert NotPolicyManager();
        _;
    }

    constructor(IERC20 asset_, address owner_)
        ERC20("Edgier Pool Share", "EDGR")
        ERC4626(asset_)
        Ownable(owner_)
    {}

    function setPolicyManager(address pm) external onlyOwner {
        policyManager = pm;
        emit PolicyManagerSet(pm);
    }

    /// @notice Capital not already reserved against a live policy.
    function freeCapacity() public view returns (uint256) {
        uint256 assets = totalAssets();
        return assets > lockedCapacity ? assets - lockedCapacity : 0;
    }

    /// @dev Underwriters cannot withdraw capital that is backing a live policy.
    function maxWithdraw(address owner_) public view override returns (uint256) {
        uint256 owed = super.maxWithdraw(owner_);
        uint256 free = freeCapacity();
        return owed < free ? owed : free;
    }

    function maxRedeem(address owner_) public view override returns (uint256) {
        uint256 shares = super.maxRedeem(owner_);
        uint256 freeShares = convertToShares(freeCapacity());
        return shares < freeShares ? shares : freeShares;
    }

    // --- policy manager hooks --------------------------------------------

    function lockCapacity(uint256 amount) external onlyPolicyManager {
        uint256 free = freeCapacity();
        if (amount > free) revert InsufficientFreeCapacity(amount, free);
        lockedCapacity += amount;
        emit CapacityLocked(amount, lockedCapacity);
    }

    function releaseCapacity(uint256 amount) external onlyPolicyManager {
        uint256 amt = amount > lockedCapacity ? lockedCapacity : amount;
        lockedCapacity -= amt;
        emit CapacityReleased(amt, lockedCapacity);
    }

    /// @notice Pull a premium in from the buyer. Accrues to every share holder.
    function collectPremium(address from, uint256 amount) external onlyPolicyManager {
        IERC20(asset()).safeTransferFrom(from, address(this), amount);
        emit PremiumCollected(from, amount);
    }

    /// @notice Pay a verified claim. Only reachable after an Attestcoin proof verified.
    function payClaim(address to, uint256 amount) external onlyPolicyManager {
        uint256 amt = amount > lockedCapacity ? lockedCapacity : amount;
        lockedCapacity -= amt;
        IERC20(asset()).safeTransfer(to, amt);
        emit ClaimPaid(to, amt);
    }
}
