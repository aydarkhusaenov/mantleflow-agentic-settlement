// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IInvoiceEscrowBondHarness {
    function postServiceBond(uint256 invoiceId, uint256 amount) external payable;
    function withdraw(address token) external returns (uint256 amount);
}

contract MockBondingRejectETH {
    bool private acceptingEth;

    function postBond(address escrow, uint256 invoiceId) external payable {
        IInvoiceEscrowBondHarness(escrow).postServiceBond{value: msg.value}(invoiceId, msg.value);
    }

    function withdrawPending(address escrow, address token) external returns (uint256 amount) {
        acceptingEth = true;
        amount = IInvoiceEscrowBondHarness(escrow).withdraw(token);
        acceptingEth = false;
    }

    receive() external payable {
        if (!acceptingEth) revert("NO_ETH");
    }
}
