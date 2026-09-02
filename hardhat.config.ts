import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const pk = process.env.DEPLOYER_PRIVATE_KEY;
const accounts = pk ? [pk] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // The BlockProver precompile call passes nested dynamic structs.
      viaIR: true,
    },
  },
  networks: {
    // --- source chain (where the risk lives) ---
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL ?? "",
      accounts,
    },
    // --- Creditcoin (where capital, policies and settlement live) ---
    cc3testnet: {
      url: process.env.CC3_TESTNET_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network",
      accounts,
      // NOTE: confirm the EVM chainId from the RPC before pinning it here.
      //   curl -s -X POST $CC3_TESTNET_RPC_URL \
      //     -H 'content-type: application/json' \
      //     -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
  },
};

export default config;
