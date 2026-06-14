// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockERC20} from "./MockERC20.sol";

contract MockEIP3009Token is MockERC20 {
    mapping(address authorizer => mapping(bytes32 nonce => bool used)) public authorizationState;
    uint256 public transferShortfall;

    error AuthorizationAlreadyUsed();
    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error InvalidAuthorization();

    function setTransferShortfall(uint256 value) external {
        transferShortfall = value;
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (to != msg.sender || from == address(0) || v != 27 || r == bytes32(0) || s == bytes32(0)) {
            revert InvalidAuthorization();
        }
        if (block.timestamp <= validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (authorizationState[from][nonce]) revert AuthorizationAlreadyUsed();

        authorizationState[from][nonce] = true;
        _transfer(from, to, value - transferShortfall);
    }
}
