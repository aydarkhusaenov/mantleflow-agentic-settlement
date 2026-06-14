// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

contract MockERC1271Wallet is IERC1271 {
    bytes32 private validDigest;
    bytes32 private validSignatureHash;
    bool private valid;

    function setValidation(bytes32 digest, bytes calldata signature, bool isValid) external {
        validDigest = digest;
        validSignatureHash = keccak256(signature);
        valid = isValid;
    }

    function isValidSignature(bytes32 digest, bytes memory signature) external view returns (bytes4) {
        if (valid && digest == validDigest && keccak256(signature) == validSignatureHash) {
            return IERC1271.isValidSignature.selector;
        }
        return 0xffffffff;
    }
}
