// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IInvoiceEscrowWithdrawHarness {
    function withdraw(address token) external returns (uint256 amount);
}

contract MockRejectETH {
    function withdrawPending(address escrow, address token) external returns (uint256 amount) {
        return IInvoiceEscrowWithdrawHarness(escrow).withdraw(token);
    }

    receive() external payable {
        revert("NO_ETH");
    }
}
