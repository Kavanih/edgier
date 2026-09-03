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
    // --- Creditcoin (where capital, policies and settlement live) ---
    cc3testnet: {
      url: process.env.CC3_TESTNET_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network",
      accounts,
      // Confirmed against the live RPC (eth_chainId -> 0x18e8f) and the
      // Creditcoin docs' Testnet environment table.
      chainId: 102031,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
  },
};

export default config;
