export const invoiceEscrowAbi = [
  {
    type: "function",
    name: "invoiceCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }]
  },
  {
    type: "function",
    name: "getInvoice",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct InvoiceEscrow.Invoice",
        components: [
          { name: "creator", type: "address", internalType: "address" },
          { name: "payer", type: "address", internalType: "address" },
          { name: "recipient", type: "address", internalType: "address" },
          { name: "token", type: "address", internalType: "address" },
          { name: "amount", type: "uint256", internalType: "uint256" },
          { name: "dueAt", type: "uint64", internalType: "uint64" },
          { name: "paidAt", type: "uint64", internalType: "uint64" },
          { name: "timeout", type: "uint64", internalType: "uint64" },
          { name: "refundRequestedAt", type: "uint64", internalType: "uint64" },
          { name: "settlementProposedAt", type: "uint64", internalType: "uint64" },
          { name: "deliveryMarkedAt", type: "uint64", internalType: "uint64" },
          { name: "deliveryEvidenceCount", type: "uint64", internalType: "uint64" },
          { name: "disputeMarkedAt", type: "uint64", internalType: "uint64" },
          { name: "disputeEvidenceCount", type: "uint64", internalType: "uint64" },
          { name: "deliveryEvidenceRoot", type: "bytes32", internalType: "bytes32" },
          { name: "disputeEvidenceRoot", type: "bytes32", internalType: "bytes32" },
          { name: "state", type: "uint8", internalType: "enum InvoiceEscrow.State" },
          { name: "metadataHash", type: "string", internalType: "string" },
          { name: "deliveryHash", type: "string", internalType: "string" },
          { name: "disputeHash", type: "string", internalType: "string" },
          { name: "settlementMemoHash", type: "string", internalType: "string" },
          { name: "settlementProposedBy", type: "address", internalType: "address" },
          { name: "settlementRecipientAmount", type: "uint256", internalType: "uint256" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "getAgentContext",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct InvoiceEscrow.AgentContext",
        components: [
          { name: "payerAgentHash", type: "bytes32", internalType: "bytes32" },
          { name: "recipientAgentHash", type: "bytes32", internalType: "bytes32" },
          { name: "mandateHash", type: "bytes32", internalType: "bytes32" },
          { name: "policyHash", type: "bytes32", internalType: "bytes32" },
          { name: "intentMandateHash", type: "bytes32", internalType: "bytes32" },
          { name: "cartMandateHash", type: "bytes32", internalType: "bytes32" },
          { name: "paymentMandateHash", type: "bytes32", internalType: "bytes32" },
          { name: "promptPlaybackHash", type: "bytes32", internalType: "bytes32" },
          { name: "slaDeadline", type: "uint64", internalType: "uint64" },
          { name: "attachedAt", type: "uint64", internalType: "uint64" },
          { name: "attachedBy", type: "address", internalType: "address" },
          { name: "authorizedPayer", type: "address", internalType: "address" },
          { name: "mandateExpiresAt", type: "uint64", internalType: "uint64" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "settlementReceiptHash",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }]
  },
  {
    type: "function",
    name: "getBondContext",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct InvoiceEscrow.BondContext",
        components: [
          { name: "activeAmount", type: "uint256", internalType: "uint256" },
          { name: "resolvedAmount", type: "uint256", internalType: "uint256" },
          { name: "resolvedRecipient", type: "address", internalType: "address" },
          { name: "slashed", type: "bool", internalType: "bool" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "getFeedbackContext",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct InvoiceEscrow.FeedbackContext",
        components: [
          { name: "count", type: "uint64", internalType: "uint64" },
          { name: "root", type: "bytes32", internalType: "bytes32" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "getValidationContext",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct InvoiceEscrow.ValidationContext",
        components: [
          { name: "count", type: "uint64", internalType: "uint64" },
          { name: "root", type: "bytes32", internalType: "bytes32" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "getAgentReputation",
    stateMutability: "view",
    inputs: [{ name: "agentHash", type: "bytes32", internalType: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct InvoiceEscrow.AgentReputation",
        components: [
          { name: "feedbackCount", type: "uint64", internalType: "uint64" },
          { name: "feedbackScoreSum", type: "int256", internalType: "int256" },
          { name: "validationCount", type: "uint64", internalType: "uint64" },
          { name: "validationScoreSum", type: "int256", internalType: "int256" },
          { name: "approvedValidationCount", type: "uint64", internalType: "uint64" },
          { name: "rollingRoot", type: "bytes32", internalType: "bytes32" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "getAgentReputationSummary",
    stateMutability: "view",
    inputs: [{ name: "agentHash", type: "bytes32", internalType: "bytes32" }],
    outputs: [
      { name: "count", type: "uint64", internalType: "uint64" },
      { name: "summaryValue", type: "int256", internalType: "int256" },
      { name: "valueDecimals", type: "uint8", internalType: "uint8" }
    ]
  },
  {
    type: "function",
    name: "getSummary",
    stateMutability: "view",
    inputs: [{ name: "agentHash", type: "bytes32", internalType: "bytes32" }],
    outputs: [
      { name: "count", type: "uint64", internalType: "uint64" },
      { name: "summaryValue", type: "int256", internalType: "int256" },
      { name: "summaryValueDecimals", type: "uint8", internalType: "uint8" }
    ]
  },
  {
    type: "function",
    name: "paymentRequirementHash",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }]
  },
  {
    type: "function",
    name: "paymentMandateDigest",
    stateMutability: "view",
    inputs: [
      { name: "invoiceId", type: "uint256", internalType: "uint256" },
      { name: "authorizedPayer", type: "address", internalType: "address" },
      { name: "payerAgentHash", type: "bytes32", internalType: "bytes32" },
      { name: "recipientAgentHash", type: "bytes32", internalType: "bytes32" },
      { name: "mandateHash", type: "bytes32", internalType: "bytes32" },
      { name: "policyHash", type: "bytes32", internalType: "bytes32" },
      { name: "slaDeadline", type: "uint64", internalType: "uint64" },
      { name: "mandateExpiresAt", type: "uint64", internalType: "uint64" }
    ],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }]
  },
  {
    type: "function",
    name: "actionParamsHash",
    stateMutability: "pure",
    inputs: [
      { name: "action", type: "uint8", internalType: "uint8" },
      { name: "recipientAmount", type: "uint256", internalType: "uint256" },
      { name: "dataHash", type: "string", internalType: "string" }
    ],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }]
  },
  {
    type: "function",
    name: "actionPermitDigest",
    stateMutability: "view",
    inputs: [
      { name: "invoiceId", type: "uint256", internalType: "uint256" },
      { name: "action", type: "uint8", internalType: "uint8" },
      { name: "signer", type: "address", internalType: "address" },
      { name: "executor", type: "address", internalType: "address" },
      { name: "paramsHash", type: "bytes32", internalType: "bytes32" },
      { name: "validAfter", type: "uint64", internalType: "uint64" },
      { name: "expiresAt", type: "uint64", internalType: "uint64" },
      { name: "nonce", type: "uint256", internalType: "uint256" }
    ],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }]
  },
  {
    type: "function",
    name: "usedActionNonces",
    stateMutability: "view",
    inputs: [
      { name: "signer", type: "address", internalType: "address" },
      { name: "nonce", type: "uint256", internalType: "uint256" }
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }]
  },
  {
    type: "function",
    name: "usedValidationNonces",
    stateMutability: "view",
    inputs: [
      { name: "validator", type: "address", internalType: "address" },
      { name: "nonce", type: "uint256", internalType: "uint256" }
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }]
  },
  {
    type: "function",
    name: "withdrawable",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address", internalType: "address" },
      { name: "token", type: "address", internalType: "address" }
    ],
    outputs: [{ name: "amount", type: "uint256", internalType: "uint256" }]
  },
  {
    type: "function",
    name: "eip712DomainSeparator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }]
  },
  {
    type: "function",
    name: "eip712Domain",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "fields", type: "bytes1", internalType: "bytes1" },
      { name: "name", type: "string", internalType: "string" },
      { name: "version", type: "string", internalType: "string" },
      { name: "chainId", type: "uint256", internalType: "uint256" },
      { name: "verifyingContract", type: "address", internalType: "address" },
      { name: "salt", type: "bytes32", internalType: "bytes32" },
      { name: "extensions", type: "uint256[]", internalType: "uint256[]" }
    ]
  },
  {
    type: "function",
    name: "createInvoice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address", internalType: "address" },
      { name: "token", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
      { name: "metadataHash", type: "string", internalType: "string" },
      { name: "dueAt", type: "uint64", internalType: "uint64" },
      { name: "timeout", type: "uint64", internalType: "uint64" }
    ],
    outputs: [{ name: "invoiceId", type: "uint256", internalType: "uint256" }]
  },
  {
    type: "function",
    name: "payInvoice",
    stateMutability: "payable",
    inputs: [{ name: "invoiceId", type: "uint256", internalType: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "payInvoiceWithAuthorization",
    stateMutability: "payable",
    inputs: [
      { name: "invoiceId", type: "uint256", internalType: "uint256" },
      { name: "payer", type: "address", internalType: "address" },
      { name: "validAfter", type: "uint256", internalType: "uint256" },
      { name: "validBefore", type: "uint256", internalType: "uint256" },
      { name: "nonce", type: "bytes32", internalType: "bytes32" },
      { name: "v", type: "uint8", internalType: "uint8" },
      { name: "r", type: "bytes32", internalType: "bytes32" },
      { name: "s", type: "bytes32", internalType: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "attachAgentMandate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "uint256", internalType: "uint256" },
      { name: "payerAgentHash", type: "bytes32", internalType: "bytes32" },
      { name: "recipientAgentHash", type: "bytes32", internalType: "bytes32" },
      { name: "mandateHash", type: "bytes32", internalType: "bytes32" },
      { name: "policyHash", type: "bytes32", internalType: "bytes32" },
      { name: "slaDeadline", type: "uint64", internalType: "uint64" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "attachAP2AgentMandate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "uint256", internalType: "uint256" },
      { name: "payerAgentHash", type: "bytes32", internalType: "bytes32" },
      { name: "recipientAgentHash", type: "bytes32", internalType: "bytes32" },
      { name: "intentMandateHash", type: "bytes32", internalType: "bytes32" },
      { name: "cartMandateHash", type: "bytes32", internalType: "bytes32" },
      { name: "paymentMandateHash", type: "bytes32", internalType: "bytes32" },
      { name: "promptPlaybackHash", type: "bytes32", internalType: "bytes32" },
      { name: "policyHash", type: "bytes32", internalType: "bytes32" },
      { name: "slaDeadline", type: "uint64", internalType: "uint64" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "attachSignedAgentMandate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "uint256", internalType: "uint256" },
      { name: "authorizedPayer", type: "address", internalType: "address" },
      { name: "payerAgentHash", type: "bytes32", internalType: "bytes32" },
      { name: "recipientAgentHash", type: "bytes32", internalType: "bytes32" },
      { name: "mandateHash", type: "bytes32", internalType: "bytes32" },
      { name: "policyHash", type: "bytes32", internalType: "bytes32" },
      { name: "slaDeadline", type: "uint64", internalType: "uint64" },
      { name: "mandateExpiresAt", type: "uint64", internalType: "uint64" },
      { name: "signature", type: "bytes", internalType: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "postServiceBond",
    stateMutability: "payable",
    inputs: [
      { name: "invoiceId", type: "uint256", internalType: "uint256" },
      { name: "amount", type: "uint256", internalType: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address", internalType: "address" }],
    outputs: [{ name: "amount", type: "uint256", internalType: "uint256" }]
  },
  {
    type: "function",
    name: "cancelActionNonce",
    stateMutability: "nonpayable",
    inputs: [{ name: "nonce", type: "uint256", internalType: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "cancelValidationNonce",
    stateMutability: "nonpayable",
    inputs: [{ name: "nonce", type: "uint256", internalType: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "executeActionPermit",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "permit",
        type: "tuple",
        internalType: "struct InvoiceEscrow.ActionPermitCall",
        components: [
          { name: "invoiceId", type: "uint256", internalType: "uint256" },
          { name: "action", type: "uint8", internalType: "uint8" },
          { name: "signer", type: "address", internalType: "address" },
          { name: "executor", type: "address", internalType: "address" },
          { name: "recipientAmount", type: "uint256", internalType: "uint256" },
          { name: "dataHash", type: "string", internalType: "string" },
          { name: "validAfter", type: "uint64", internalType: "uint64" },
          { name: "expiresAt", type: "uint64", internalType: "uint64" },
          { name: "nonce", type: "uint256", internalType: "uint256" },
          { name: "signature", type: "bytes", internalType: "bytes" }
        ]
      }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "submitAgentValidation",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "attestation",
        type: "tuple",
        internalType: "struct InvoiceEscrow.ValidationAttestation",
        components: [
          { name: "invoiceId", type: "uint256", internalType: "uint256" },
          { name: "validator", type: "address", internalType: "address" },
          { name: "validatorAgentHash", type: "bytes32", internalType: "bytes32" },
          { name: "subjectAgentHash", type: "bytes32", internalType: "bytes32" },
          { name: "approved", type: "bool", internalType: "bool" },
          { name: "score", type: "int128", internalType: "int128" },
          { name: "schemaHash", type: "bytes32", internalType: "bytes32" },
          { name: "evidenceURI", type: "string", internalType: "string" },
          { name: "evidenceHash", type: "bytes32", internalType: "bytes32" },
          { name: "teeAttestationHash", type: "bytes32", internalType: "bytes32" },
          { name: "expiresAt", type: "uint64", internalType: "uint64" },
          { name: "nonce", type: "uint256", internalType: "uint256" },
          { name: "signature", type: "bytes", internalType: "bytes" }
        ]
      }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "validationAttestationDigest",
    stateMutability: "view",
    inputs: [
      {
        name: "attestation",
        type: "tuple",
        internalType: "struct InvoiceEscrow.ValidationAttestation",
        components: [
          { name: "invoiceId", type: "uint256", internalType: "uint256" },
          { name: "validator", type: "address", internalType: "address" },
          { name: "validatorAgentHash", type: "bytes32", internalType: "bytes32" },
          { name: "subjectAgentHash", type: "bytes32", internalType: "bytes32" },
          { name: "approved", type: "bool", internalType: "bool" },
          { name: "score", type: "int128", internalType: "int128" },
          { name: "schemaHash", type: "bytes32", internalType: "bytes32" },
          { name: "evidenceURI", type: "string", internalType: "string" },
          { name: "evidenceHash", type: "bytes32", internalType: "bytes32" },
          { name: "teeAttestationHash", type: "bytes32", internalType: "bytes32" },
          { name: "expiresAt", type: "uint64", internalType: "uint64" },
          { name: "nonce", type: "uint256", internalType: "uint256" },
          { name: "signature", type: "bytes", internalType: "bytes" }
        ]
      }
    ],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }]
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [{ name: "invoiceId", type: "uint256", internalType: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "requestRefund",
    stateMutability: "nonpayable",
    inputs: [{ name: "invoiceId", type: "uint256", internalType: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "markDelivered",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "uint256", internalType: "uint256" },
      { name: "deliveryHash", type: "string", internalType: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "markDisputed",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "uint256", internalType: "uint256" },
      { name: "disputeHash", type: "string", internalType: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "proposeSettlement",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "uint256", internalType: "uint256" },
      { name: "recipientAmount", type: "uint256", internalType: "uint256" },
      { name: "memoHash", type: "string", internalType: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "cancelSettlementProposal",
    stateMutability: "nonpayable",
    inputs: [{ name: "invoiceId", type: "uint256", internalType: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "submitAgentFeedback",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "uint256", internalType: "uint256" },
      { name: "recipientAgent", type: "bool", internalType: "bool" },
      { name: "score", type: "int128", internalType: "int128" },
      { name: "tag1", type: "string", internalType: "string" },
      { name: "tag2", type: "string", internalType: "string" },
      { name: "feedbackURI", type: "string", internalType: "string" },
      { name: "feedbackHash", type: "bytes32", internalType: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "acceptSettlement",
    stateMutability: "nonpayable",
    inputs: [{ name: "invoiceId", type: "uint256", internalType: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "invoiceId", type: "uint256", internalType: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "cancelUnpaid",
    stateMutability: "nonpayable",
    inputs: [{ name: "invoiceId", type: "uint256", internalType: "uint256" }],
    outputs: []
  }
] as const;
