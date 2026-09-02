// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DemoVault
/// @notice The insured contract, living on Ethereum Sepolia. Deliberately
///         rug-pullable so the loss event can be fired live during the demo.
///
/// @dev It emits the ECOSYSTEM-STANDARD event signatures — EIP-1967 `Upgraded`,
///      OpenZeppelin `Paused`, ERC-20 `Transfer` — rather than bespoke ones.
///      That matters: it means the policies Nullvote writes are not special
///      cased to this contract. The same trigger works against a real protocol.
///
///      Per the Creditcoin docs, source-chain logic stays thin; all the business
///      logic lives on Creditcoin.
contract DemoVault {
    address public owner;
    address public implementation;
    bool public paused;

    mapping(address => uint256) public balanceOf;
    uint256 public totalDeposits;

    /// @dev EIP-1967 standard signature.
    event Upgraded(address indexed implementation);
    /// @dev OpenZeppelin Pausable standard signature.
    event Paused(address account);
    /// @dev ERC-20 standard signature — used here to represent value leaving the vault.
    event Transfer(address indexed from, address indexed to, uint256 value);

    event Deposited(address indexed user, uint256 amount);

    error NotOwner();
    error IsPaused();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function deposit() external payable {
        if (paused) revert IsPaused();
        balanceOf[msg.sender] += msg.value;
        totalDeposits += msg.value;
        emit Deposited(msg.sender, msg.value);
        emit Transfer(address(0), msg.sender, msg.value);
    }

    // --- the three loss events Nullvote writes policies against ---------

    /// @dev TriggerLib.Kind.ADMIN_UPGRADE
    function upgradeTo(address newImplementation) external onlyOwner {
        implementation = newImplementation;
        emit Upgraded(newImplementation);
    }

    /// @dev TriggerLib.Kind.EMERGENCY_PAUSE
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    /// @dev TriggerLib.Kind.LARGE_OUTFLOW — `from` is the vault itself.
    function drain(address to, uint256 amount) external onlyOwner {
        emit Transfer(address(this), to, amount);
        (bool sent, ) = to.call{value: amount}("");
        require(sent, "send failed");
    }
}
