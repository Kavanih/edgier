// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    IBlockProver,
    IChainInfo,
    IEvmV1Decoder,
    CommonTxFields,
    ReceiptFields,
    LogEntry,
    TransactionMerkleProof,
    ContinuityProof
} from "../creditcoin/interfaces/IAttestcoin.sol";

/// @notice Stands in for the BlockProver precompile in local tests.
/// @dev It proves nothing — that is the point. On the real network the
///      precompile is what makes the claim path trustless; here we only want to
///      exercise the settlement logic that sits on top of it.
contract MockBlockProver is IBlockProver {
    bool public result = true;

    function setResult(bool r) external { result = r; }

    function verify(uint64, uint64, bytes calldata, TransactionMerkleProof calldata, ContinuityProof calldata)
        external view override returns (bool) { return result; }

    function verify(uint64, uint64[] calldata, bytes[] calldata, TransactionMerkleProof[] calldata, ContinuityProof calldata)
        external view override returns (bool) { return result; }

    function verifyAndEmit(uint64, uint64, bytes calldata, TransactionMerkleProof calldata, ContinuityProof calldata)
        external view override returns (bool) { return result; }

    function calculateTxIndex(TransactionMerkleProof calldata) external pure override returns (uint64) {
        return 0;
    }
}

/// @notice Stands in for the on-chain EvmV1Decoder in local tests.
/// @dev Tests pass `abi.encode(CommonTxFields, ReceiptFields)` as the blob,
///      which keeps the shapes identical to the real decoder's outputs.
contract MockEvmV1Decoder is IEvmV1Decoder {
    function getTransactionType(bytes calldata) external pure override returns (uint8) {
        return 2;
    }

    function isValidTransactionType(uint8 txType) external pure override returns (bool) {
        return txType <= 4;
    }

    function decodeCommonTxFields(bytes calldata chunk)
        external pure override returns (CommonTxFields memory txn)
    {
        (txn, ) = abi.decode(chunk, (CommonTxFields, ReceiptFields));
    }

    function decodeReceiptFields(bytes calldata chunk)
        external pure override returns (ReceiptFields memory receipt)
    {
        ( , receipt) = abi.decode(chunk, (CommonTxFields, ReceiptFields));
    }

    function getLogsByEventSignature(LogEntry[] calldata logs, bytes32 eventSignature)
        external pure override returns (LogEntry[] memory out)
    {
        uint256 n;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == eventSignature) n++;
        }
        out = new LogEntry[](n);
        uint256 j;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == eventSignature) out[j++] = logs[i];
        }
    }
}

/// @notice Stands in for the ChainInfo precompile in local tests.
contract MockChainInfo is IChainInfo {
    mapping(uint64 => AttestedPoint) private _latest;

    function setLatest(uint64 chainKey, uint64 height, bool exists) external {
        _latest[chainKey] = AttestedPoint(height, bytes32(0), true, exists);
    }

    function get_supported_chains() external pure override returns (SupportedChain[] memory) {
        SupportedChain[] memory chains = new SupportedChain[](1);
        chains[0] = SupportedChain(1, 11155111, bytes("Ethereum Sepolia"), 1);
        return chains;
    }

    function get_latest_attestation_height_and_hash(uint64 chainKey)
        external view override returns (AttestedPoint memory)
    {
        return _latest[chainKey];
    }

    function get_attestation_genesis_height(uint64) external pure override returns (uint64) {
        return 0;
    }

    function is_height_attested(uint64 chainKey, uint64 targetHeight)
        external view override returns (bool)
    {
        return _latest[chainKey].exists && targetHeight <= _latest[chainKey].height;
    }
}
