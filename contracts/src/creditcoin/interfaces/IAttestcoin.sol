// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Well-known Attestcoin Protocol addresses.
///      Source: docs.creditcoin.org/attestcoin-protocol/attestcoin-protocol-chains-environments
library AttestcoinAddresses {
    address internal constant CHAIN_INFO_PRECOMPILE   = 0x0000000000000000000000000000000000000fD3;
    address internal constant BLOCK_PROVER_PRECOMPILE = 0x0000000000000000000000000000000000000FD2;

    // EvmV1Decoder is a normal contract, and differs per environment.
    address internal constant DECODER_CC3_TESTNET = 0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f;
    address internal constant DECODER_CC3_MAINNET = 0x9D094C9f22B10FCf842c2fC6A0981630A4F94B5C;

    // Source chain keys are Creditcoin-internal ids, NOT EVM chain ids.
    uint32 internal constant CHAINKEY_ETH_SEPOLIA = 1; // as seen from CC3 Testnet
    uint32 internal constant CHAINKEY_ETH_MAINNET = 3; // as seen from CC3 Testnet
}

/// @notice One step in the block's transaction Merkle path.
/// @dev Shape taken from @gluwa/usc-sdk `MerkleProofEntry`.
struct MerkleProofEntry {
    bytes32 hash;
    bool isLeft;
}

/// @notice Proof that a transaction sits in a block's transaction Merkle tree.
/// @dev Shape taken from @gluwa/usc-sdk `TransactionMerkleProof`.
struct TransactionMerkleProof {
    bytes32 root;
    MerkleProofEntry[] siblings;
}

/// @notice Proof linking that block to an attestation point recorded on Creditcoin.
/// @dev Shape taken from @gluwa/usc-sdk `ContinuityProof`.
struct ContinuityProof {
    bytes32 lowerEndpointDigest;
    bytes32[] roots;
}

/// @notice Creditcoin's on-chain transaction-inclusion verifier (precompile 0x…0FD2).
/// @dev Signatures taken verbatim from the SDK's block_prover.json. Note the name
///      is `verify` (overloaded), NOT `verifySingle` — the latter is only the
///      SDK's TypeScript wrapper name, and calling it reverts with
///      "Unknown selector". chainKey is uint64 here, not uint32.
interface IBlockProver {
    /// @notice Verify one transaction's inclusion.
    function verify(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        TransactionMerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external view returns (bool);

    /// @notice Verify a batch sharing one continuity proof (max 10, within 1000 blocks).
    function verify(
        uint64 chainKey,
        uint64[] calldata heights,
        bytes[] calldata encodedTransactions,
        TransactionMerkleProof[] calldata merkleProofs,
        ContinuityProof calldata sharedContinuityProof
    ) external view returns (bool);

    /// @notice Verify and emit `TransactionVerified(uint64,uint64,uint64)`.
    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        TransactionMerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external returns (bool);

    function calculateTxIndex(TransactionMerkleProof calldata merkleProof)
        external view returns (uint64);
}

/// @notice Attestation state on Creditcoin (precompile 0x…0FD3).
/// @dev Signatures are snake_case — taken verbatim from the SDK's chain_info.json.
interface IChainInfo {
    struct AttestedPoint {
        uint64  height;
        bytes32 hash;
        bool    isAttestation;
        bool    exists;
    }

    struct SupportedChain {
        uint64 chainKey;
        uint64 chainId;
        bytes  chainName;
        uint8  chainEncoding;
    }

    function get_supported_chains() external view returns (SupportedChain[] memory);

    function get_latest_attestation_height_and_hash(uint64 chainKey)
        external view returns (AttestedPoint memory);

    /// @notice Earliest source-chain height Creditcoin can prove anything about.
    function get_attestation_genesis_height(uint64 chainKey) external view returns (uint64);

    function is_height_attested(uint64 chainKey, uint64 targetHeight) external view returns (bool);
}

// --- EvmV1Decoder ---------------------------------------------------------
// The proven `txBytes` are an ABI encoding of the transaction *and its receipt*.
// Shapes below are lifted verbatim from the SDK's evmV1DecoderAbi.json.

struct CommonTxFields {
    uint64  nonce;
    uint64  gasLimit;
    address from;
    bool    toIsNull;
    address to;
    uint256 value;
    bytes   data;
}

struct LogEntry {
    address   address_;
    bytes32[] topics;
    bytes     data;
}

struct ReceiptFields {
    uint8         receiptStatus;
    uint64        receiptGasUsed;
    LogEntry[]    receiptLogs;
    bytes         receiptLogsBloom;
}

/// @notice Decodes a proven transaction blob into transaction and receipt fields.
/// @dev This is the single most important discovery in the integration: the
///      encoding carries the RECEIPT, so a proof gives you `receiptStatus`
///      (did it actually succeed?) and the full event logs — not just calldata.
interface IEvmV1Decoder {
    function getTransactionType(bytes calldata chunk) external pure returns (uint8);
    function isValidTransactionType(uint8 txType) external pure returns (bool);

    function decodeCommonTxFields(bytes calldata chunk) external pure returns (CommonTxFields memory);
    function decodeReceiptFields(bytes calldata chunk) external pure returns (ReceiptFields memory);

    function getLogsByEventSignature(LogEntry[] calldata logs, bytes32 eventSignature)
        external pure returns (LogEntry[] memory);
}
