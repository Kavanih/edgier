# Going live on testnet

Everything below uses **testnets only**. Nothing here touches real money.

> **Use a throwaway key.** Create a key that has never held anything of value and
> never will. `.env` is gitignored, but a private key on a development machine
> should still be one you would not mind losing.
>
> ```bash
> node -e "console.log(require('ethers').Wallet.createRandom().privateKey)"
> ```
>
> Run that twice — once for `DEPLOYER_PRIVATE_KEY`, once for `WATCHER_PRIVATE_KEY`.
> They can be the same key; keeping them apart just makes the demo's point that
> the watcher is not privileged.

---

## The two networks

Edgier straddles two chains, and you need funds on both.

| | Creditcoin CC3 Testnet | Ethereum Sepolia |
|---|---|---|
| what lives there | pool, policies, settlement | the insured contract |
| native token | tCTC | SepoliaETH |
| EVM chain id | **102031** | 11155111 |
| RPC | `https://rpc.cc3-testnet.creditcoin.network` | `https://ethereum-sepolia-rpc.publicnode.com` |
| explorer | https://creditcoin-testnet.blockscout.com | https://sepolia.etherscan.io |

Both RPC URLs above are public and need no API key. Verified live:

```bash
curl -s -X POST https://rpc.cc3-testnet.creditcoin.network \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
# {"jsonrpc":"2.0","id":1,"result":"0x18e8f"}   ->  102031
```

---

## Step 1 — get tCTC (Creditcoin)

Creditcoin's testnet faucet is a **Discord bot**, not a website.

1. Join the Creditcoin Discord: https://discord.gg/creditcoin
2. Open the **`token-faucet`** channel.
3. Send, with your **EVM** address (`0x…`, not a Substrate address):

   ```
   /faucet address:0xYourEvmAddressHere
   ```

4. The bot replies "CTC faucet submitted", then "CTC Faucet successful" in a thread.
5. Confirm it landed:

   ```bash
   curl -s -X POST https://rpc.cc3-testnet.creditcoin.network \
     -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"eth_getBalance","params":["0xYourEvmAddressHere","latest"]}'
   ```

   Anything other than `"0x0"` means you are funded.

Source: [Using Testnet Faucet](https://docs.creditcoin.org/wallets/using-testnet-faucet.md).

## Step 2 — get SepoliaETH

Sepolia faucets come and go, and most now rate-limit by account age. The ones
that usually work:

- **Google Cloud Web3 faucet** — https://cloud.google.com/application/web3/faucet/ethereum/sepolia
- **Alchemy** — https://sepoliafaucet.com (free Alchemy account required)
- **Infura** — https://www.infura.io/faucet/sepolia

You need very little — a deploy plus a handful of transactions. If every faucet
refuses you, see *Plan B* at the bottom: you can demo against Ethereum **mainnet
history** without spending anything at all.

## Step 3 — fill in `.env`

```bash
cp .env.example .env
```

```bash
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
CC3_TESTNET_RPC_URL=https://rpc.cc3-testnet.creditcoin.network
PROOF_BUILDER_URL=https://prover.cc3-testnet.creditcoin.network

# 1 = Ethereum Sepolia, 3 = Ethereum Mainnet (as seen from CC3 Testnet)
CHAIN_KEY=1

DEPLOYER_PRIVATE_KEY=0x...
WATCHER_PRIVATE_KEY=0x...
```

Leave the address variables blank — the deploy scripts print what to paste back.

## Step 4 — preflight

```bash
npm run preflight
```

This asks the ChainInfo precompile what Creditcoin can actually prove right now.
**Read the output before going further.** If `chainKey 1` shows no attestations,
or its latest attested height is far behind Sepolia's head, a live Sepolia demo
will stall — switch to Plan B rather than discovering it on camera.

## Step 5 — validate the proof path, before spending anything

```bash
npm run verify:live      # full proof pipeline against the live precompiles
npm run verify:trigger   # real TriggerLib vs a real proven Sepolia transaction
```

Both are read-only and need no funds. If these pass, the encoding is right and
what remains is only gas.

## Step 6 — deploy

```bash
npm run deploy:sepolia      # DemoVault -> paste VULNERABLE_VAULT_ADDRESS into .env
npm run deploy:creditcoin   # pool + policies + verifier, wired to the REAL precompiles
```

`deploy:creditcoin` also rewrites `web/src/generated/deployment.json`, so:

```bash
npm run web
```

now opens the UI against the live network. The banner turns green, the role
switcher is replaced by **Connect wallet**, and every transaction is signed by
your own wallet on chain 102031.

## Step 7 — the live claim

```bash
npm run watch          # terminal 1: the watcher
npm run trigger:demo   # terminal 2: rug the vault on Sepolia
```

The watcher waits for Creditcoin to attest the source block, fetches the proof,
and submits the claim.

**Budget for the wait.** Attestation is periodic, not instant —
`waitUntilHeightAttested` polls and gives up after about fifteen minutes. Do not
hide that wait in the demo video. It is the honest cost of not trusting an
oracle, and saying so out loud is a stronger answer than pretending it is fast.

You can also settle from the UI: open the policy, and submit. Because
`submitClaim` is permissionless, it works from a wallet that holds no policy.

---

## Plan B — prove a real mainnet incident instead

Ethereum **Mainnet** is a supported source chain from Creditcoin **testnet**
(`chainKey 3`), and its attestation genesis is block **0**. The entire history of
Ethereum mainnet is provable from a testnet deployment.

That means you can point a policy at a *real protocol* and settle against a
*real historical exploit transaction* — no Sepolia funds, no staged vault.

```bash
CHAIN_KEY=3 npm run preflight   # confirm the range on camera
```

Then write the policy's window around the real incident's block number and
target the real contract address. The trigger signatures are ecosystem standards
(EIP-1967 `Upgraded`, OpenZeppelin `Paused`, ERC-20 `Transfer`), so they match
real protocols with no changes.

This is the strongest version of the demo. It is also the one that needs the
least money.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `nonce has already been used` | two transactions sent inside ~250ms; the UI disables ethers' RPC cache, scripts should `await tx.wait()` |
| `Unknown selector` from the precompile | calling `verifySingle` — that name only exists in the SDK's TypeScript wrapper. The precompile's method is the overloaded `verify(...)`, and `chainKey` is `uint64` |
| deploy reverts with no reason | out of tCTC — re-run the Discord faucet |
| watcher never submits | the source block is not attested yet, or is below the attestation genesis. Check `npm run preflight` |
| `ProofRejected` on chain | the proof is real but for a different `chainKey` than the policy's trigger |
