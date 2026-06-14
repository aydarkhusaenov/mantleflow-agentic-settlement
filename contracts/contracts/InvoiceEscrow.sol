// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IERC3009Receiver {
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
    ) external;
}

contract InvoiceEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 public constant EIP712_NAME_HASH = keccak256("MantleFlow Agentic Settlement");
    bytes32 public constant EIP712_VERSION_HASH = keccak256("1");
    bytes32 public constant PAYMENT_MANDATE_TYPEHASH = keccak256(
        "PaymentMandate(uint256 invoiceId,address payer,bytes32 paymentRequirementHash,bytes32 payerAgentHash,bytes32 recipientAgentHash,bytes32 mandateHash,bytes32 policyHash,uint64 slaDeadline,uint64 expiresAt)"
    );
    bytes32 public constant ACTION_PERMIT_TYPEHASH = keccak256(
        "ActionPermit(uint256 invoiceId,uint8 action,address signer,address executor,bytes32 paramsHash,uint64 validAfter,uint64 expiresAt,uint256 nonce)"
    );
    bytes32 public constant VALIDATION_ATTESTATION_TYPEHASH = keccak256(
        "ValidationAttestation(uint256 invoiceId,address validator,bytes32 validatorAgentHash,bytes32 subjectAgentHash,bool approved,int128 score,bytes32 receiptHash,bytes32 schemaHash,bytes32 evidenceURIHash,bytes32 evidenceHash,bytes32 teeAttestationHash,uint64 expiresAt,uint256 nonce)"
    );
    enum State {
        Created,
        Paid,
        RefundRequested,
        Released,
        Refunded,
        Cancelled,
        Settled
    }

    enum PermitAction {
        Release,
        RequestRefund,
        Refund,
        MarkDelivered,
        MarkDisputed,
        ProposeSettlement,
        CancelSettlementProposal,
        AcceptSettlement
    }

    struct Invoice {
        address creator;
        address payer;
        address recipient;
        address token;
        uint256 amount;
        uint64 dueAt;
        uint64 paidAt;
        uint64 timeout;
        uint64 refundRequestedAt;
        uint64 settlementProposedAt;
        uint64 deliveryMarkedAt;
        uint64 deliveryEvidenceCount;
        uint64 disputeMarkedAt;
        uint64 disputeEvidenceCount;
        bytes32 deliveryEvidenceRoot;
        bytes32 disputeEvidenceRoot;
        State state;
        string metadataHash;
        string deliveryHash;
        string disputeHash;
        string settlementMemoHash;
        address settlementProposedBy;
        uint256 settlementRecipientAmount;
    }

    struct AgentContext {
        bytes32 payerAgentHash;
        bytes32 recipientAgentHash;
        bytes32 mandateHash;
        bytes32 policyHash;
        bytes32 intentMandateHash;
        bytes32 cartMandateHash;
        bytes32 paymentMandateHash;
        bytes32 promptPlaybackHash;
        uint64 slaDeadline;
        uint64 attachedAt;
        address attachedBy;
        address authorizedPayer;
        uint64 mandateExpiresAt;
    }

    struct BondContext {
        uint256 activeAmount;
        uint256 resolvedAmount;
        address resolvedRecipient;
        bool slashed;
    }

    struct FeedbackContext {
        uint64 count;
        bytes32 root;
    }

    struct ValidationContext {
        uint64 count;
        bytes32 root;
    }

    struct AgentReputation {
        uint64 feedbackCount;
        int256 feedbackScoreSum;
        uint64 validationCount;
        int256 validationScoreSum;
        uint64 approvedValidationCount;
        bytes32 rollingRoot;
    }

    struct ActionPermitCall {
        uint256 invoiceId;
        uint8 action;
        address signer;
        address executor;
        uint256 recipientAmount;
        string dataHash;
        uint64 validAfter;
        uint64 expiresAt;
        uint256 nonce;
        bytes signature;
    }

    struct ValidationAttestation {
        uint256 invoiceId;
        address validator;
        bytes32 validatorAgentHash;
        bytes32 subjectAgentHash;
        bool approved;
        int128 score;
        bytes32 schemaHash;
        string evidenceURI;
        bytes32 evidenceHash;
        bytes32 teeAttestationHash;
        uint64 expiresAt;
        uint256 nonce;
        bytes signature;
    }

    uint256 public invoiceCount;
    mapping(uint256 invoiceId => Invoice) private invoices;
    mapping(uint256 invoiceId => AgentContext) private agentContexts;
    mapping(uint256 invoiceId => BondContext) private bondContexts;
    mapping(uint256 invoiceId => FeedbackContext) private feedbackContexts;
    mapping(uint256 invoiceId => ValidationContext) private validationContexts;
    mapping(bytes32 agentHash => AgentReputation) private agentReputations;
    mapping(address signer => mapping(uint256 nonce => bool)) public usedActionNonces;
    mapping(address validator => mapping(uint256 nonce => bool)) public usedValidationNonces;
    mapping(address account => mapping(address token => uint256 amount)) public withdrawable;

    event InvoiceCreated(
        uint256 indexed invoiceId,
        address indexed creator,
        address indexed recipient,
        address token,
        uint256 amount,
        uint64 dueAt,
        uint64 timeout,
        string metadataHash
    );
    event InvoicePaid(uint256 indexed invoiceId, address indexed payer, address token, uint256 amount);
    event ServiceBondPosted(uint256 indexed invoiceId, address indexed recipient, address token, uint256 amount);
    event ServiceBondResolved(
        uint256 indexed invoiceId,
        address indexed beneficiary,
        uint256 amount,
        bool slashed
    );
    event InvoiceReleased(uint256 indexed invoiceId, address indexed payer, address indexed recipient, uint256 amount);
    event RefundRequested(uint256 indexed invoiceId, address indexed payer, uint64 refundAvailableAt);
    event InvoiceRefunded(uint256 indexed invoiceId, address indexed payer, uint256 amount);
    event InvoiceCancelled(uint256 indexed invoiceId);
    event AgentMandateAttached(
        uint256 indexed invoiceId,
        address indexed attachedBy,
        bytes32 payerAgentHash,
        bytes32 recipientAgentHash,
        bytes32 mandateHash,
        bytes32 policyHash,
        bytes32 intentMandateHash,
        bytes32 cartMandateHash,
        bytes32 paymentMandateHash,
        bytes32 promptPlaybackHash,
        uint64 slaDeadline,
        address authorizedPayer,
        uint64 mandateExpiresAt
    );
    event DeliveryMarked(uint256 indexed invoiceId, address indexed recipient, string deliveryHash);
    event SettlementProposed(
        uint256 indexed invoiceId,
        address indexed proposedBy,
        uint256 recipientAmount,
        uint256 payerAmount,
        string memoHash
    );
    event SettlementAccepted(
        uint256 indexed invoiceId,
        address indexed acceptedBy,
        uint256 recipientAmount,
        uint256 payerAmount
    );
    event SettlementReceiptFinalized(uint256 indexed invoiceId, bytes32 indexed receiptHash, State finalState);
    event DeliveryEvidenceAppended(
        uint256 indexed invoiceId,
        address indexed recipient,
        uint64 evidenceCount,
        bytes32 evidenceRoot,
        string deliveryHash
    );
    event DisputeMarked(uint256 indexed invoiceId, address indexed payer, string disputeHash);
    event DisputeEvidenceAppended(
        uint256 indexed invoiceId,
        address indexed payer,
        uint64 evidenceCount,
        bytes32 evidenceRoot,
        string disputeHash
    );
    event SettlementProposalCancelled(uint256 indexed invoiceId, address indexed cancelledBy);
    event AgentFeedbackSubmitted(
        uint256 indexed invoiceId,
        address indexed reviewer,
        bytes32 indexed agentHash,
        bool recipientAgent,
        int128 score,
        string tag1,
        string tag2,
        string feedbackURI,
        bytes32 feedbackHash,
        bytes32 receiptHash,
        uint64 feedbackCount,
        bytes32 feedbackRoot
    );
    event ERC8004FeedbackRecorded(
        bytes32 indexed agentHash,
        uint64 indexed feedbackCount,
        int128 score,
        string tag1,
        string tag2,
        string feedbackURI,
        bytes32 feedbackHash
    );
    event ActionPermitExecuted(
        uint256 indexed invoiceId,
        address indexed signer,
        address indexed executor,
        uint8 action,
        uint256 nonce,
        bytes32 paramsHash
    );
    event ActionNonceCancelled(address indexed signer, uint256 indexed nonce);
    event AgentValidationSubmitted(
        uint256 indexed invoiceId,
        address indexed validator,
        bytes32 indexed subjectAgentHash,
        bytes32 validatorAgentHash,
        bool approved,
        int128 score,
        bytes32 schemaHash,
        string evidenceURI,
        bytes32 evidenceHash,
        bytes32 teeAttestationHash,
        bytes32 receiptHash,
        uint64 validationCount,
        bytes32 validationRoot
    );
    event ERC8004ValidationRecorded(
        bytes32 indexed subjectAgentHash,
        address indexed validator,
        bytes32 indexed requestHash,
        bool approved,
        int128 score,
        string responseURI,
        bytes32 responseHash,
        string tag
    );
    event ValidationNonceCancelled(address indexed validator, uint256 indexed nonce);
    event AgentReputationUpdated(
        bytes32 indexed agentHash,
        uint64 feedbackCount,
        int256 feedbackScoreSum,
        uint64 validationCount,
        int256 validationScoreSum,
        uint64 approvedValidationCount,
        bytes32 rollingRoot
    );
    event PayoutCredited(address indexed account, address indexed token, uint256 amount);
    event Withdrawn(address indexed account, address indexed token, uint256 amount);

    error InvalidRecipient();
    error InvalidAmount();
    error InvalidTimeout();
    error InvoiceNotFound();
    error InvalidState(State expected, State actual);
    error Unauthorized();
    error InvoicePastDue();
    error IncorrectPayment();
    error RefundTimeoutNotReached(uint256 availableAt);
    error InvalidSettlementAmount();
    error NoSettlementProposal();
    error InvalidMandate();
    error InvalidBondAmount();
    error MandateAlreadyAttached();
    error InvalidSlaDeadline();
    error InvalidPayer();
    error InvalidSignature();
    error MandateExpired();
    error InvalidEvidence();
    error InvalidFeedback();
    error InvalidActionPermit();
    error ActionPermitNotActive();
    error ActionPermitExpired();
    error ActionPermitUsed();
    error InvalidValidation();
    error ValidationAttestationExpired();
    error ValidationAttestationUsed();
    error NothingToWithdraw();
    error InvalidAuthorizationNonce();

    function createInvoice(
        address recipient,
        address token,
        uint256 amount,
        string calldata metadataHash,
        uint64 dueAt,
        uint64 timeout
    ) external nonReentrant returns (uint256 invoiceId) {
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (timeout == 0) revert InvalidTimeout();

        invoiceId = invoiceCount++;
        invoices[invoiceId] = Invoice({
            creator: msg.sender,
            payer: address(0),
            recipient: recipient,
            token: token,
            amount: amount,
            dueAt: dueAt,
            paidAt: 0,
            timeout: timeout,
            refundRequestedAt: 0,
            settlementProposedAt: 0,
            deliveryMarkedAt: 0,
            deliveryEvidenceCount: 0,
            disputeMarkedAt: 0,
            disputeEvidenceCount: 0,
            deliveryEvidenceRoot: bytes32(0),
            disputeEvidenceRoot: bytes32(0),
            state: State.Created,
            metadataHash: metadataHash,
            deliveryHash: "",
            disputeHash: "",
            settlementMemoHash: "",
            settlementProposedBy: address(0),
            settlementRecipientAmount: 0
        });

        emit InvoiceCreated(invoiceId, msg.sender, recipient, token, amount, dueAt, timeout, metadataHash);
    }

    function payInvoice(uint256 invoiceId) external payable nonReentrant {
        Invoice storage invoice = _invoice(invoiceId);
        if (invoice.state != State.Created) revert InvalidState(State.Created, invoice.state);
        if (invoice.dueAt != 0 && block.timestamp > invoice.dueAt) revert InvoicePastDue();

        AgentContext storage context = agentContexts[invoiceId];
        if (context.authorizedPayer != address(0) && msg.sender != context.authorizedPayer) revert Unauthorized();
        if (context.mandateExpiresAt != 0 && block.timestamp >= context.mandateExpiresAt) revert MandateExpired();

        if (invoice.token == address(0)) {
            if (msg.value != invoice.amount) revert IncorrectPayment();
        } else {
            if (msg.value != 0) revert IncorrectPayment();
            _pullExactToken(invoice.token, msg.sender, invoice.amount);
        }

        invoice.payer = msg.sender;
        invoice.paidAt = uint64(block.timestamp);
        invoice.state = State.Paid;

        emit InvoicePaid(invoiceId, msg.sender, invoice.token, invoice.amount);
    }

    function payInvoiceWithAuthorization(
        uint256 invoiceId,
        address payer,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable nonReentrant {
        Invoice storage invoice = _invoice(invoiceId);
        if (invoice.state != State.Created) revert InvalidState(State.Created, invoice.state);
        if (invoice.dueAt != 0 && block.timestamp > invoice.dueAt) revert InvoicePastDue();
        if (invoice.token == address(0) || msg.value != 0) revert IncorrectPayment();
        if (payer == address(0)) revert InvalidPayer();
        if (nonce != paymentRequirementHash(invoiceId)) revert InvalidAuthorizationNonce();

        AgentContext storage context = agentContexts[invoiceId];
        if (context.authorizedPayer != address(0) && payer != context.authorizedPayer) revert Unauthorized();
        if (context.mandateExpiresAt != 0 && block.timestamp >= context.mandateExpiresAt) revert MandateExpired();

        uint256 balanceBefore = IERC20(invoice.token).balanceOf(address(this));
        // slither-disable-next-line reentrancy-balance
        IERC3009Receiver(invoice.token).receiveWithAuthorization(
            payer,
            address(this),
            invoice.amount,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );
        uint256 balanceAfter = IERC20(invoice.token).balanceOf(address(this));
        if (balanceAfter - balanceBefore != invoice.amount) revert IncorrectPayment();

        invoice.payer = payer;
        invoice.paidAt = uint64(block.timestamp);
        invoice.state = State.Paid;

        emit InvoicePaid(invoiceId, payer, invoice.token, invoice.amount);
    }

    function attachAgentMandate(
        uint256 invoiceId,
        bytes32 payerAgentHash,
        bytes32 recipientAgentHash,
        bytes32 mandateHash,
        bytes32 policyHash,
        uint64 slaDeadline
    ) external nonReentrant {
        Invoice storage invoice = _invoice(invoiceId);
        if (msg.sender != invoice.creator && msg.sender != invoice.recipient) revert Unauthorized();
        if (invoice.state != State.Created) revert InvalidState(State.Created, invoice.state);
        if (mandateHash == bytes32(0)) revert InvalidMandate();
        _validateMandateAttach(invoiceId, slaDeadline);
        _attachAgentContext(
            invoiceId,
            AgentContext({
                payerAgentHash: payerAgentHash,
                recipientAgentHash: recipientAgentHash,
                mandateHash: mandateHash,
                policyHash: policyHash,
                intentMandateHash: bytes32(0),
                cartMandateHash: bytes32(0),
                paymentMandateHash: mandateHash,
                promptPlaybackHash: policyHash,
                slaDeadline: slaDeadline,
                attachedAt: uint64(block.timestamp),
                attachedBy: msg.sender,
                authorizedPayer: address(0),
                mandateExpiresAt: 0
            })
        );
    }

    function attachAP2AgentMandate(
        uint256 invoiceId,
        bytes32 payerAgentHash,
        bytes32 recipientAgentHash,
        bytes32 intentMandateHash,
        bytes32 cartMandateHash,
        bytes32 paymentMandateHash,
        bytes32 promptPlaybackHash,
        bytes32 policyHash,
        uint64 slaDeadline
    ) external nonReentrant {
        Invoice storage invoice = _invoice(invoiceId);
        if (msg.sender != invoice.creator && msg.sender != invoice.recipient) revert Unauthorized();
        if (invoice.state != State.Created) revert InvalidState(State.Created, invoice.state);
        if (paymentMandateHash == bytes32(0)) revert InvalidMandate();
        _validateMandateAttach(invoiceId, slaDeadline);
        _attachAgentContext(
            invoiceId,
            AgentContext({
                payerAgentHash: payerAgentHash,
                recipientAgentHash: recipientAgentHash,
                mandateHash: paymentMandateHash,
                policyHash: policyHash,
                intentMandateHash: intentMandateHash,
                cartMandateHash: cartMandateHash,
                paymentMandateHash: paymentMandateHash,
                promptPlaybackHash: promptPlaybackHash,
                slaDeadline: slaDeadline,
                attachedAt: uint64(block.timestamp),
                attachedBy: msg.sender,
                authorizedPayer: address(0),
                mandateExpiresAt: 0
            })
        );
    }

    function attachSignedAgentMandate(
        uint256 invoiceId,
        address authorizedPayer,
        bytes32 payerAgentHash,
        bytes32 recipientAgentHash,
        bytes32 mandateHash,
        bytes32 policyHash,
        uint64 slaDeadline,
        uint64 mandateExpiresAt,
        bytes calldata signature
    ) external nonReentrant {
        Invoice storage invoice = _invoice(invoiceId);
        if (invoice.state != State.Created) revert InvalidState(State.Created, invoice.state);
        if (authorizedPayer == address(0)) revert InvalidPayer();
        if (mandateHash == bytes32(0)) revert InvalidMandate();
        if (mandateExpiresAt != 0 && mandateExpiresAt <= block.timestamp) revert MandateExpired();
        _validateMandateAttach(invoiceId, slaDeadline);

        bytes32 digest = paymentMandateDigest(
            invoiceId,
            authorizedPayer,
            payerAgentHash,
            recipientAgentHash,
            mandateHash,
            policyHash,
            slaDeadline,
            mandateExpiresAt
        );
        if (!_isValidSignature(authorizedPayer, digest, signature)) revert InvalidSignature();

        _attachAgentContext(
            invoiceId,
            AgentContext({
                payerAgentHash: payerAgentHash,
                recipientAgentHash: recipientAgentHash,
                mandateHash: mandateHash,
                policyHash: policyHash,
                intentMandateHash: bytes32(0),
                cartMandateHash: bytes32(0),
                paymentMandateHash: mandateHash,
                promptPlaybackHash: policyHash,
                slaDeadline: slaDeadline,
                attachedAt: uint64(block.timestamp),
                attachedBy: msg.sender,
                authorizedPayer: authorizedPayer,
                mandateExpiresAt: mandateExpiresAt
            })
        );
    }

    function postServiceBond(uint256 invoiceId, uint256 amount) external payable nonReentrant {
        Invoice storage invoice = _invoice(invoiceId);
        if (msg.sender != invoice.recipient) revert Unauthorized();
        if (invoice.state != State.Created && invoice.state != State.Paid) {
            revert InvalidState(State.Paid, invoice.state);
        }
        if (amount == 0) revert InvalidBondAmount();

        if (invoice.token == address(0)) {
            if (msg.value != amount) revert IncorrectPayment();
        } else {
            if (msg.value != 0) revert IncorrectPayment();
            _pullExactToken(invoice.token, msg.sender, amount);
        }

        bondContexts[invoiceId].activeAmount += amount;

        emit ServiceBondPosted(invoiceId, msg.sender, invoice.token, amount);
    }

    function withdraw(address token) external nonReentrant returns (uint256 amount) {
        amount = withdrawable[msg.sender][token];
        if (amount == 0) revert NothingToWithdraw();

        withdrawable[msg.sender][token] = 0;
        emit Withdrawn(msg.sender, token, amount);

        _transferOutStrict(token, msg.sender, amount);
    }

    function release(uint256 invoiceId) external nonReentrant {
        _release(invoiceId, msg.sender);
    }

    function requestRefund(uint256 invoiceId) external nonReentrant {
        _requestRefund(invoiceId, msg.sender);
    }

    function markDelivered(uint256 invoiceId, string calldata deliveryHash) external nonReentrant {
        _markDelivered(invoiceId, msg.sender, deliveryHash);
    }

    function markDisputed(uint256 invoiceId, string calldata disputeHash) external nonReentrant {
        _markDisputed(invoiceId, msg.sender, disputeHash);
    }

    function proposeSettlement(
        uint256 invoiceId,
        uint256 recipientAmount,
        string calldata memoHash
    ) external nonReentrant {
        _proposeSettlement(invoiceId, msg.sender, recipientAmount, memoHash);
    }

    function cancelSettlementProposal(uint256 invoiceId) external nonReentrant {
        _cancelSettlementProposal(invoiceId, msg.sender);
    }

    function acceptSettlement(uint256 invoiceId) external nonReentrant {
        _acceptSettlement(invoiceId, msg.sender);
    }

    function refund(uint256 invoiceId) external nonReentrant {
        _refund(invoiceId, msg.sender);
    }

    function executeActionPermit(ActionPermitCall calldata permit) external nonReentrant {
        if (permit.signer == address(0)) revert InvalidActionPermit();
        if (permit.executor != address(0) && msg.sender != permit.executor) revert Unauthorized();
        if (block.timestamp < permit.validAfter) revert ActionPermitNotActive();
        if (permit.expiresAt != 0 && block.timestamp >= permit.expiresAt) revert ActionPermitExpired();
        if (usedActionNonces[permit.signer][permit.nonce]) revert ActionPermitUsed();

        bytes32 paramsHash = actionParamsHash(permit.action, permit.recipientAmount, permit.dataHash);
        bytes32 digest = actionPermitDigest(
            permit.invoiceId,
            permit.action,
            permit.signer,
            permit.executor,
            paramsHash,
            permit.validAfter,
            permit.expiresAt,
            permit.nonce
        );
        if (!_isValidSignature(permit.signer, digest, permit.signature)) revert InvalidSignature();

        usedActionNonces[permit.signer][permit.nonce] = true;
        _executePermittedAction(permit);

        emit ActionPermitExecuted(
            permit.invoiceId,
            permit.signer,
            msg.sender,
            permit.action,
            permit.nonce,
            paramsHash
        );
    }

    function cancelActionNonce(uint256 nonce) external nonReentrant {
        if (usedActionNonces[msg.sender][nonce]) revert ActionPermitUsed();
        usedActionNonces[msg.sender][nonce] = true;
        emit ActionNonceCancelled(msg.sender, nonce);
    }

    function cancelValidationNonce(uint256 nonce) external nonReentrant {
        if (usedValidationNonces[msg.sender][nonce]) revert ValidationAttestationUsed();
        usedValidationNonces[msg.sender][nonce] = true;
        emit ValidationNonceCancelled(msg.sender, nonce);
    }

    function _release(uint256 invoiceId, address actor) private {
        Invoice storage invoice = _invoice(invoiceId);
        if (invoice.state != State.Paid) revert InvalidState(State.Paid, invoice.state);

        AgentContext storage context = agentContexts[invoiceId];
        bool payerRelease = actor == invoice.payer;
        bool recipientTimeoutRelease = actor == invoice.recipient && block.timestamp >= invoice.paidAt + invoice.timeout
            && _releaseEvidenceSatisfied(invoice, context);
        if (!payerRelease && !recipientTimeoutRelease) revert Unauthorized();

        address token = invoice.token;
        address payer = invoice.payer;
        address recipient = invoice.recipient;
        uint256 amount = invoice.amount;

        invoice.state = State.Released;
        (address bondRecipient, uint256 bondAmount) = _settleServiceBond(invoiceId, invoice, true);
        bytes32 receiptHash = settlementReceiptHash(invoiceId);

        emit InvoiceReleased(invoiceId, payer, recipient, amount);
        emit SettlementReceiptFinalized(invoiceId, receiptHash, invoice.state);

        _transferOut(token, recipient, amount);
        _transferOutIfNeeded(token, bondRecipient, bondAmount);
    }

    function _requestRefund(uint256 invoiceId, address actor) private {
        Invoice storage invoice = _invoice(invoiceId);
        if (invoice.state != State.Paid) revert InvalidState(State.Paid, invoice.state);
        if (actor != invoice.payer) revert Unauthorized();

        invoice.refundRequestedAt = uint64(block.timestamp);
        invoice.state = State.RefundRequested;

        emit RefundRequested(invoiceId, actor, uint64(block.timestamp) + invoice.timeout);
    }

    function _markDelivered(uint256 invoiceId, address actor, string calldata deliveryHash) private {
        Invoice storage invoice = _invoice(invoiceId);
        if (invoice.state != State.Paid && invoice.state != State.RefundRequested) {
            revert InvalidState(State.Paid, invoice.state);
        }
        if (actor != invoice.recipient) revert Unauthorized();
        if (bytes(deliveryHash).length == 0) revert InvalidEvidence();

        uint64 markedAt = uint64(block.timestamp);
        if (invoice.deliveryMarkedAt == 0) {
            invoice.deliveryHash = deliveryHash;
            invoice.deliveryMarkedAt = markedAt;
        }

        uint64 evidenceCount = invoice.deliveryEvidenceCount + 1;
        bytes32 evidenceRoot = keccak256(
            abi.encode(
                "MantleFlow_DELIVERY_EVIDENCE_V1",
                invoice.deliveryEvidenceRoot,
                invoiceId,
                actor,
                evidenceCount,
                markedAt,
                keccak256(bytes(deliveryHash))
            )
        );
        invoice.deliveryEvidenceCount = evidenceCount;
        invoice.deliveryEvidenceRoot = evidenceRoot;

        emit DeliveryMarked(invoiceId, actor, deliveryHash);
        emit DeliveryEvidenceAppended(invoiceId, actor, evidenceCount, evidenceRoot, deliveryHash);
    }

    function _markDisputed(uint256 invoiceId, address actor, string calldata disputeHash) private {
        Invoice storage invoice = _invoice(invoiceId);
        if (invoice.state != State.Paid && invoice.state != State.RefundRequested) {
            revert InvalidState(State.Paid, invoice.state);
        }
        if (actor != invoice.payer) revert Unauthorized();
        if (bytes(disputeHash).length == 0) revert InvalidEvidence();

        uint64 markedAt = uint64(block.timestamp);
        if (invoice.disputeMarkedAt == 0) {
            invoice.disputeHash = disputeHash;
            invoice.disputeMarkedAt = markedAt;
            emit DisputeMarked(invoiceId, actor, disputeHash);
        }

        uint64 evidenceCount = invoice.disputeEvidenceCount + 1;
        bytes32 evidenceRoot = keccak256(
            abi.encode(
                "MantleFlow_DISPUTE_EVIDENCE_V1",
                invoice.disputeEvidenceRoot,
                invoiceId,
                actor,
                evidenceCount,
                markedAt,
                keccak256(bytes(disputeHash))
            )
        );
        invoice.disputeEvidenceCount = evidenceCount;
        invoice.disputeEvidenceRoot = evidenceRoot;

        emit DisputeEvidenceAppended(invoiceId, actor, evidenceCount, evidenceRoot, disputeHash);
    }

    function _proposeSettlement(uint256 invoiceId, address actor, uint256 recipientAmount, string calldata memoHash) private {
        Invoice storage invoice = _invoice(invoiceId);
        if (invoice.state != State.Paid && invoice.state != State.RefundRequested) {
            revert InvalidState(State.Paid, invoice.state);
        }
        if (actor != invoice.payer && actor != invoice.recipient) revert Unauthorized();
        if (recipientAmount > invoice.amount) revert InvalidSettlementAmount();

        invoice.settlementProposedBy = actor;
        invoice.settlementRecipientAmount = recipientAmount;
        invoice.settlementProposedAt = uint64(block.timestamp);
        invoice.settlementMemoHash = memoHash;

        emit SettlementProposed(invoiceId, actor, recipientAmount, invoice.amount - recipientAmount, memoHash);
    }

    function _cancelSettlementProposal(uint256 invoiceId, address actor) private {
        Invoice storage invoice = _invoice(invoiceId);
        if (invoice.state != State.Paid && invoice.state != State.RefundRequested) {
            revert InvalidState(State.Paid, invoice.state);
        }
        if (invoice.settlementProposedBy == address(0)) revert NoSettlementProposal();
        if (actor != invoice.settlementProposedBy) revert Unauthorized();

        invoice.settlementProposedBy = address(0);
        invoice.settlementRecipientAmount = 0;
        invoice.settlementProposedAt = 0;
        invoice.settlementMemoHash = "";

        emit SettlementProposalCancelled(invoiceId, actor);
    }

    function _acceptSettlement(uint256 invoiceId, address actor) private {
        Invoice storage invoice = _invoice(invoiceId);
        if (invoice.state != State.Paid && invoice.state != State.RefundRequested) {
            revert InvalidState(State.Paid, invoice.state);
        }
        if (invoice.settlementProposedBy == address(0)) revert NoSettlementProposal();
        if (actor != invoice.payer && actor != invoice.recipient) revert Unauthorized();
        if (actor == invoice.settlementProposedBy) revert Unauthorized();

        uint256 recipientAmount = invoice.settlementRecipientAmount;
        uint256 payerAmount = invoice.amount - recipientAmount;
        address token = invoice.token;
        address recipient = invoice.recipient;
        address payer = invoice.payer;

        invoice.state = State.Settled;
        (address bondRecipient, uint256 bondAmount) = _settleServiceBond(invoiceId, invoice, true);
        bytes32 receiptHash = settlementReceiptHash(invoiceId);

        emit SettlementAccepted(invoiceId, actor, recipientAmount, payerAmount);
        emit SettlementReceiptFinalized(invoiceId, receiptHash, invoice.state);

        if (recipientAmount != 0) {
            _transferOut(token, recipient, recipientAmount);
        }
        if (payerAmount != 0) {
            _transferOut(token, payer, payerAmount);
        }
        _transferOutIfNeeded(token, bondRecipient, bondAmount);
    }

    function _refund(uint256 invoiceId, address actor) private {
        Invoice storage invoice = _invoice(invoiceId);
        if (invoice.state != State.RefundRequested) revert InvalidState(State.RefundRequested, invoice.state);

        uint256 refundAvailableAt = invoice.refundRequestedAt + invoice.timeout;
        bool recipientApproves = actor == invoice.recipient;
        bool payerTimeoutClaim = actor == invoice.payer && block.timestamp >= refundAvailableAt;
        if (!recipientApproves && !payerTimeoutClaim) {
            if (actor == invoice.payer) revert RefundTimeoutNotReached(refundAvailableAt);
            revert Unauthorized();
        }

        address payer = invoice.payer;
        uint256 amount = invoice.amount;
        address token = invoice.token;

        invoice.state = State.Refunded;
        (address bondRecipient, uint256 bondAmount) = _settleServiceBond(invoiceId, invoice, false);
        bytes32 receiptHash = settlementReceiptHash(invoiceId);

        emit InvoiceRefunded(invoiceId, payer, amount);
        emit SettlementReceiptFinalized(invoiceId, receiptHash, invoice.state);

        _transferOut(token, payer, amount);
        _transferOutIfNeeded(token, bondRecipient, bondAmount);
    }

    function cancelUnpaid(uint256 invoiceId) external nonReentrant {
        Invoice storage invoice = _invoice(invoiceId);
        if (invoice.state != State.Created) revert InvalidState(State.Created, invoice.state);
        if (msg.sender != invoice.creator && msg.sender != invoice.recipient) revert Unauthorized();

        address token = invoice.token;
        invoice.state = State.Cancelled;
        (address bondRecipient, uint256 bondAmount) = _settleServiceBond(invoiceId, invoice, true);
        bytes32 receiptHash = settlementReceiptHash(invoiceId);

        emit InvoiceCancelled(invoiceId);
        emit SettlementReceiptFinalized(invoiceId, receiptHash, invoice.state);

        _transferOutIfNeeded(token, bondRecipient, bondAmount);
    }

    function getInvoice(uint256 invoiceId) external view returns (Invoice memory) {
        return _invoiceView(invoiceId);
    }

    function getAgentContext(uint256 invoiceId) external view returns (AgentContext memory) {
        _invoiceView(invoiceId);
        return agentContexts[invoiceId];
    }

    function getBondContext(uint256 invoiceId) external view returns (BondContext memory) {
        _invoiceView(invoiceId);
        return bondContexts[invoiceId];
    }

    function getFeedbackContext(uint256 invoiceId) external view returns (FeedbackContext memory) {
        _invoiceView(invoiceId);
        return feedbackContexts[invoiceId];
    }

    function getValidationContext(uint256 invoiceId) external view returns (ValidationContext memory) {
        _invoiceView(invoiceId);
        return validationContexts[invoiceId];
    }

    function getAgentReputation(bytes32 agentHash) external view returns (AgentReputation memory) {
        return agentReputations[agentHash];
    }

    function getAgentReputationSummary(bytes32 agentHash)
        external
        view
        returns (uint64 count, int256 summaryValue, uint8 valueDecimals)
    {
        return _agentReputationSummary(agentHash);
    }

    function getSummary(bytes32 agentHash)
        external
        view
        returns (uint64 count, int256 summaryValue, uint8 summaryValueDecimals)
    {
        return _agentReputationSummary(agentHash);
    }

    function _agentReputationSummary(bytes32 agentHash)
        private
        view
        returns (uint64 count, int256 summaryValue, uint8 valueDecimals)
    {
        AgentReputation storage reputation = agentReputations[agentHash];
        count = reputation.feedbackCount + reputation.validationCount;
        valueDecimals = 0;
        if (count == 0) return (0, 0, valueDecimals);
        summaryValue =
            (reputation.feedbackScoreSum + reputation.validationScoreSum) / int256(uint256(count));
    }

    function submitAgentFeedback(
        uint256 invoiceId,
        bool recipientAgent,
        int128 score,
        string calldata tag1,
        string calldata tag2,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external nonReentrant {
        Invoice storage invoice = _invoice(invoiceId);
        if (!_isFinal(invoice.state)) revert InvalidState(State.Released, invoice.state);
        if (score < -100 || score > 100) revert InvalidFeedback();

        AgentContext storage context = agentContexts[invoiceId];
        bytes32 agentHash = recipientAgent ? context.recipientAgentHash : context.payerAgentHash;
        if (agentHash == bytes32(0)) revert InvalidFeedback();
        if (recipientAgent) {
            if (msg.sender != invoice.payer) revert Unauthorized();
        } else if (msg.sender != invoice.recipient) {
            revert Unauthorized();
        }

        bytes32 receiptHash = settlementReceiptHash(invoiceId);
        FeedbackContext storage feedback = feedbackContexts[invoiceId];
        uint64 feedbackCount = feedback.count + 1;
        bytes32 feedbackRoot = keccak256(
            abi.encode(
                "MantleFlow_AGENT_FEEDBACK_V1",
                feedback.root,
                block.chainid,
                address(this),
                invoiceId,
                receiptHash,
                msg.sender,
                agentHash,
                recipientAgent,
                score,
                feedbackCount,
                keccak256(bytes(tag1)),
                keccak256(bytes(tag2)),
                keccak256(bytes(feedbackURI)),
                feedbackHash
            )
        );
        feedback.count = feedbackCount;
        feedback.root = feedbackRoot;
        _updateFeedbackReputation(agentHash, msg.sender, score, receiptHash, feedbackRoot);

        emit AgentFeedbackSubmitted(
            invoiceId,
            msg.sender,
            agentHash,
            recipientAgent,
            score,
            tag1,
            tag2,
            feedbackURI,
            feedbackHash,
            receiptHash,
            feedbackCount,
            feedbackRoot
        );
        emit ERC8004FeedbackRecorded(agentHash, feedbackCount, score, tag1, tag2, feedbackURI, feedbackHash);
    }

    function submitAgentValidation(ValidationAttestation calldata attestation) external nonReentrant {
        Invoice storage invoice = _invoice(attestation.invoiceId);
        if (!_isFinal(invoice.state)) revert InvalidState(State.Released, invoice.state);
        if (attestation.validator == address(0)) revert InvalidValidation();
        if (attestation.validatorAgentHash == bytes32(0)) revert InvalidValidation();
        if (attestation.score < -100 || attestation.score > 100) revert InvalidValidation();
        if (attestation.expiresAt != 0 && block.timestamp >= attestation.expiresAt) {
            revert ValidationAttestationExpired();
        }
        if (usedValidationNonces[attestation.validator][attestation.nonce]) revert ValidationAttestationUsed();

        AgentContext storage context = agentContexts[attestation.invoiceId];
        if (
            attestation.subjectAgentHash == bytes32(0)
                || (
                    attestation.subjectAgentHash != context.payerAgentHash
                        && attestation.subjectAgentHash != context.recipientAgentHash
                )
        ) revert InvalidValidation();

        bytes32 receiptHash = settlementReceiptHash(attestation.invoiceId);
        bytes32 digest = _validationAttestationDigest(attestation, receiptHash);
        if (!_isValidSignature(attestation.validator, digest, attestation.signature)) revert InvalidSignature();

        usedValidationNonces[attestation.validator][attestation.nonce] = true;

        ValidationContext storage validation = validationContexts[attestation.invoiceId];
        uint64 validationCount = validation.count + 1;
        bytes32 evidenceURIHash = keccak256(bytes(attestation.evidenceURI));
        bytes32 validationRoot = keccak256(
            abi.encode(
                "MantleFlow_AGENT_VALIDATION_V1",
                validation.root,
                block.chainid,
                address(this),
                attestation.invoiceId,
                receiptHash,
                attestation.validator,
                attestation.validatorAgentHash,
                attestation.subjectAgentHash,
                attestation.approved,
                attestation.score,
                validationCount,
                attestation.schemaHash,
                evidenceURIHash,
                attestation.evidenceHash,
                attestation.teeAttestationHash,
                attestation.nonce
            )
        );
        validation.count = validationCount;
        validation.root = validationRoot;
        _updateValidationReputation(
            attestation.subjectAgentHash,
            attestation.validator,
            attestation.approved,
            attestation.score,
            receiptHash,
            validationRoot
        );

        emit AgentValidationSubmitted(
            attestation.invoiceId,
            attestation.validator,
            attestation.subjectAgentHash,
            attestation.validatorAgentHash,
            attestation.approved,
            attestation.score,
            attestation.schemaHash,
            attestation.evidenceURI,
            attestation.evidenceHash,
            attestation.teeAttestationHash,
            receiptHash,
            validationCount,
            validationRoot
        );
        emit ERC8004ValidationRecorded(
            attestation.subjectAgentHash,
            attestation.validator,
            keccak256(abi.encode(attestation.invoiceId, receiptHash, attestation.schemaHash, evidenceURIHash)),
            attestation.approved,
            attestation.score,
            attestation.evidenceURI,
            attestation.evidenceHash,
            attestation.approved ? "approved" : "rejected"
        );
    }

    function paymentRequirementHash(uint256 invoiceId) public view returns (bytes32) {
        Invoice storage invoice = _invoice(invoiceId);
        return _paymentRequirementHash(invoiceId, invoice);
    }

    function paymentMandateDigest(
        uint256 invoiceId,
        address authorizedPayer,
        bytes32 payerAgentHash,
        bytes32 recipientAgentHash,
        bytes32 mandateHash,
        bytes32 policyHash,
        uint64 slaDeadline,
        uint64 mandateExpiresAt
    ) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                eip712DomainSeparator(),
                keccak256(
                    abi.encode(
                        PAYMENT_MANDATE_TYPEHASH,
                        invoiceId,
                        authorizedPayer,
                        paymentRequirementHash(invoiceId),
                        payerAgentHash,
                        recipientAgentHash,
                        mandateHash,
                        policyHash,
                        slaDeadline,
                        mandateExpiresAt
                    )
                )
            )
        );
    }

    function actionParamsHash(
        uint8 action,
        uint256 recipientAmount,
        string calldata dataHash
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                "MantleFlow_ACTION_PARAMS_V1",
                action,
                recipientAmount,
                keccak256(bytes(dataHash))
            )
        );
    }

    function actionPermitDigest(
        uint256 invoiceId,
        uint8 action,
        address signer,
        address executor,
        bytes32 paramsHash,
        uint64 validAfter,
        uint64 expiresAt,
        uint256 nonce
    ) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                eip712DomainSeparator(),
                keccak256(
                    abi.encode(
                        ACTION_PERMIT_TYPEHASH,
                        invoiceId,
                        action,
                        signer,
                        executor,
                        paramsHash,
                        validAfter,
                        expiresAt,
                        nonce
                    )
                )
            )
        );
    }

    function validationAttestationDigest(ValidationAttestation calldata attestation) public view returns (bytes32) {
        return _validationAttestationDigest(attestation, settlementReceiptHash(attestation.invoiceId));
    }

    function eip712DomainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, EIP712_NAME_HASH, EIP712_VERSION_HASH, block.chainid, address(this)));
    }

    function eip712Domain()
        external
        view
        returns (
            bytes1 fields,
            string memory name,
            string memory version,
            uint256 chainId,
            address verifyingContract,
            bytes32 salt,
            uint256[] memory extensions
        )
    {
        return (hex"0f", "MantleFlow Agentic Settlement", "1", block.chainid, address(this), bytes32(0), new uint256[](0));
    }

    function settlementReceiptHash(uint256 invoiceId) public view returns (bytes32) {
        Invoice storage invoice = _invoice(invoiceId);
        AgentContext storage context = agentContexts[invoiceId];
        BondContext storage bond = bondContexts[invoiceId];
        bytes32 invoiceHash = keccak256(
            abi.encode(
                invoice.creator,
                invoice.payer,
                invoice.recipient,
                invoice.token,
                invoice.amount,
                invoice.state,
                invoice.metadataHash,
                invoice.deliveryHash,
                invoice.deliveryMarkedAt,
                invoice.deliveryEvidenceCount,
                invoice.deliveryEvidenceRoot,
                invoice.disputeHash,
                invoice.disputeMarkedAt,
                invoice.disputeEvidenceCount,
                invoice.disputeEvidenceRoot,
                invoice.settlementMemoHash,
                invoice.settlementRecipientAmount,
                bond.resolvedAmount,
                bond.resolvedRecipient,
                bond.slashed
            )
        );
        bytes32 contextHash = keccak256(
            abi.encode(
                context.payerAgentHash,
                context.recipientAgentHash,
                context.mandateHash,
                context.policyHash,
                context.intentMandateHash,
                context.cartMandateHash,
                context.paymentMandateHash,
                context.promptPlaybackHash,
                context.slaDeadline,
                context.authorizedPayer,
                context.mandateExpiresAt
            )
        );
        return keccak256(
            abi.encode(
                "MantleFlow_AGENT_SETTLEMENT_RECEIPT_V1",
                block.chainid,
                address(this),
                invoiceId,
                invoiceHash,
                contextHash
            )
        );
    }

    function _updateFeedbackReputation(
        bytes32 agentHash,
        address reviewer,
        int128 score,
        bytes32 receiptHash,
        bytes32 feedbackRoot
    ) private {
        AgentReputation storage reputation = agentReputations[agentHash];
        reputation.feedbackCount += 1;
        reputation.feedbackScoreSum += score;
        reputation.rollingRoot = keccak256(
            abi.encode(
                "MantleFlow_AGENT_REPUTATION_FEEDBACK_V1",
                reputation.rollingRoot,
                block.chainid,
                address(this),
                agentHash,
                reviewer,
                score,
                reputation.feedbackCount,
                receiptHash,
                feedbackRoot
            )
        );
        emit AgentReputationUpdated(
            agentHash,
            reputation.feedbackCount,
            reputation.feedbackScoreSum,
            reputation.validationCount,
            reputation.validationScoreSum,
            reputation.approvedValidationCount,
            reputation.rollingRoot
        );
    }

    function _updateValidationReputation(
        bytes32 agentHash,
        address validator,
        bool approved,
        int128 score,
        bytes32 receiptHash,
        bytes32 validationRoot
    ) private {
        AgentReputation storage reputation = agentReputations[agentHash];
        reputation.validationCount += 1;
        reputation.validationScoreSum += score;
        if (approved) reputation.approvedValidationCount += 1;
        reputation.rollingRoot = keccak256(
            abi.encode(
                "MantleFlow_AGENT_REPUTATION_VALIDATION_V1",
                reputation.rollingRoot,
                block.chainid,
                address(this),
                agentHash,
                validator,
                approved,
                score,
                reputation.validationCount,
                receiptHash,
                validationRoot
            )
        );
        emit AgentReputationUpdated(
            agentHash,
            reputation.feedbackCount,
            reputation.feedbackScoreSum,
            reputation.validationCount,
            reputation.validationScoreSum,
            reputation.approvedValidationCount,
            reputation.rollingRoot
        );
    }

    function _invoice(uint256 invoiceId) private view returns (Invoice storage invoice) {
        if (invoiceId >= invoiceCount) revert InvoiceNotFound();
        invoice = invoices[invoiceId];
    }

    function _invoiceView(uint256 invoiceId) private view returns (Invoice memory invoice) {
        if (invoiceId >= invoiceCount) revert InvoiceNotFound();
        invoice = invoices[invoiceId];
    }

    function _validateMandateAttach(uint256 invoiceId, uint64 slaDeadline) private view {
        if (agentContexts[invoiceId].mandateHash != bytes32(0)) revert MandateAlreadyAttached();
        if (slaDeadline != 0 && slaDeadline <= block.timestamp) revert InvalidSlaDeadline();
    }

    function _attachAgentContext(uint256 invoiceId, AgentContext memory context) private {
        agentContexts[invoiceId] = context;
        emit AgentMandateAttached(
            invoiceId,
            context.attachedBy,
            context.payerAgentHash,
            context.recipientAgentHash,
            context.mandateHash,
            context.policyHash,
            context.intentMandateHash,
            context.cartMandateHash,
            context.paymentMandateHash,
            context.promptPlaybackHash,
            context.slaDeadline,
            context.authorizedPayer,
            context.mandateExpiresAt
        );
    }

    function _paymentRequirementHash(uint256 invoiceId, Invoice storage invoice) private view returns (bytes32) {
        return keccak256(
            abi.encode(
                "MantleFlow_X402_ESCROW_REQUIREMENT_V1",
                block.chainid,
                address(this),
                invoiceId,
                invoice.recipient,
                invoice.token,
                invoice.amount,
                invoice.dueAt,
                invoice.timeout,
                keccak256(bytes(invoice.metadataHash))
            )
        );
    }

    function _executePermittedAction(ActionPermitCall calldata permit) private {
        if (permit.action == uint8(PermitAction.Release)) {
            _requireEmptyActionParams(permit);
            _release(permit.invoiceId, permit.signer);
        } else if (permit.action == uint8(PermitAction.RequestRefund)) {
            _requireEmptyActionParams(permit);
            _requestRefund(permit.invoiceId, permit.signer);
        } else if (permit.action == uint8(PermitAction.Refund)) {
            _requireEmptyActionParams(permit);
            _refund(permit.invoiceId, permit.signer);
        } else if (permit.action == uint8(PermitAction.MarkDelivered)) {
            if (permit.recipientAmount != 0) revert InvalidActionPermit();
            _markDelivered(permit.invoiceId, permit.signer, permit.dataHash);
        } else if (permit.action == uint8(PermitAction.MarkDisputed)) {
            if (permit.recipientAmount != 0) revert InvalidActionPermit();
            _markDisputed(permit.invoiceId, permit.signer, permit.dataHash);
        } else if (permit.action == uint8(PermitAction.ProposeSettlement)) {
            _proposeSettlement(permit.invoiceId, permit.signer, permit.recipientAmount, permit.dataHash);
        } else if (permit.action == uint8(PermitAction.CancelSettlementProposal)) {
            _requireEmptyActionParams(permit);
            _cancelSettlementProposal(permit.invoiceId, permit.signer);
        } else if (permit.action == uint8(PermitAction.AcceptSettlement)) {
            _requireEmptyActionParams(permit);
            _acceptSettlement(permit.invoiceId, permit.signer);
        } else {
            revert InvalidActionPermit();
        }
    }

    function _requireEmptyActionParams(ActionPermitCall calldata permit) private pure {
        if (permit.recipientAmount != 0 || bytes(permit.dataHash).length != 0) revert InvalidActionPermit();
    }

    function _validationAttestationDigest(
        ValidationAttestation calldata attestation,
        bytes32 receiptHash
    ) private view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                eip712DomainSeparator(),
                keccak256(
                    abi.encode(
                        VALIDATION_ATTESTATION_TYPEHASH,
                        attestation.invoiceId,
                        attestation.validator,
                        attestation.validatorAgentHash,
                        attestation.subjectAgentHash,
                        attestation.approved,
                        attestation.score,
                        receiptHash,
                        attestation.schemaHash,
                        keccak256(bytes(attestation.evidenceURI)),
                        attestation.evidenceHash,
                        attestation.teeAttestationHash,
                        attestation.expiresAt,
                        attestation.nonce
                    )
                )
            )
        );
    }

    function _isValidSignature(address signer, bytes32 digest, bytes calldata signature) private view returns (bool) {
        if (signer.code.length == 0) {
            (address recovered, ECDSA.RecoverError error, bytes32 errorArg) = ECDSA.tryRecover(digest, signature);
            return error == ECDSA.RecoverError.NoError && errorArg == bytes32(0) && recovered == signer;
        }

        (bool success, bytes memory result) = signer.staticcall(
            abi.encodeCall(IERC1271.isValidSignature, (digest, signature))
        );
        return success && result.length >= 32 && abi.decode(result, (bytes4)) == IERC1271.isValidSignature.selector;
    }

    function _settleServiceBond(
        uint256 invoiceId,
        Invoice storage invoice,
        bool successfulOutcome
    ) private returns (address beneficiary, uint256 amount) {
        BondContext storage bond = bondContexts[invoiceId];
        amount = bond.activeAmount;
        if (amount == 0) return (address(0), 0);

        AgentContext storage context = agentContexts[invoiceId];
        bool missedSla = context.slaDeadline != 0 && block.timestamp > context.slaDeadline;
        bool slashBond = !successfulOutcome && missedSla && !_hasTimelyDelivery(invoice, context) && invoice.payer != address(0);
        beneficiary = slashBond ? invoice.payer : invoice.recipient;

        bond.activeAmount = 0;
        bond.resolvedAmount = amount;
        bond.resolvedRecipient = beneficiary;
        bond.slashed = slashBond;

        emit ServiceBondResolved(invoiceId, beneficiary, amount, slashBond);
    }

    function _releaseEvidenceSatisfied(Invoice storage invoice, AgentContext storage context) private view returns (bool) {
        if (_hasTimelyDelivery(invoice, context)) return true;
        return context.slaDeadline == 0;
    }

    function _hasTimelyDelivery(Invoice storage invoice, AgentContext storage context) private view returns (bool) {
        return bytes(invoice.deliveryHash).length != 0
            && invoice.deliveryMarkedAt != 0
            && (context.slaDeadline == 0 || invoice.deliveryMarkedAt <= context.slaDeadline);
    }

    function _isFinal(State state) private pure returns (bool) {
        if (state == State.Released) return true;
        if (state == State.Refunded) return true;
        if (state == State.Cancelled) return true;
        if (state == State.Settled) return true;
        return false;
    }

    function _pullExactToken(address token, address from, uint256 amount) private {
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        if (balanceAfter - balanceBefore != amount) revert IncorrectPayment();
    }

    function _transferOut(address token, address to, uint256 amount) private {
        if (token == address(0)) {
            // Reviewed: all callers finalize state before this call and enter through nonReentrant functions.
            // slither-disable-next-line arbitrary-send-eth,reentrancy-eth
            (bool ok,) = payable(to).call{value: amount}("");
            if (!ok) {
                withdrawable[to][token] += amount;
                emit PayoutCredited(to, token, amount);
            }
        } else {
            _transferOutStrict(token, to, amount);
        }
    }

    function _transferOutIfNeeded(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        _transferOut(token, to, amount);
    }

    function _transferOutStrict(address token, address to, uint256 amount) private {
        if (token == address(0)) {
            // Reviewed: withdraw zeroes the credit before this call and is protected by nonReentrant.
            // slither-disable-next-line arbitrary-send-eth
            (bool ok,) = payable(to).call{value: amount}("");
            require(ok, "ETH_TRANSFER_FAILED");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
