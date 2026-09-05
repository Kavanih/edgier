// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Settlement asset for the cover pool on Creditcoin testnet.
contract MockUSD is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") {
        _mint(msg.sender, 10_000_000e18);
    }

    /// @dev Open faucet — testnet only.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
