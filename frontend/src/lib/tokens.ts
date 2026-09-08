/**
 * Ethereum mainnet tokens the underwriting assistant may name by symbol.
 * A draft that says "USDC" becomes an outflow row with the right address and
 * decimals; anything else the user types in by hand. Addresses are checksummed.
 */
export const KNOWN_TOKENS: Record<string, { address: string; decimals: number }> = {
  USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  DAI: { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
  WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  STETH: { address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", decimals: 18 },
  WSTETH: { address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", decimals: 18 },
  OSETH: { address: "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38", decimals: 18 },
  ALETH: { address: "0x0100546F2cD4C9D97f798fFC9755E47865FF7Ee6", decimals: 18 },
  CRV: { address: "0xD533a949740bb3306d119CC777fa900bA034cd52", decimals: 18 },
  LINK: { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
  UNI: { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
  SHIB: { address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", decimals: 18 },
  PEPE: { address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", decimals: 18 },
  FEI: { address: "0x956F47F50A910163D8BF957Cf5846D573E7f87CA", decimals: 18 },
  UST: { address: "0xa693B19d2931d498c5B318dF961919BB4aee87a5", decimals: 6 },
  KISHU: { address: "0xA2b4C0Af19cC16a6CfAcCe81F192B024d625817D", decimals: 9 },
  TSUKA: { address: "0xc5fB36dd2fb59d3B98dEfF88425a3F425Ee469eD", decimals: 9 },
  CAW: { address: "0xf3b9569F82B18aEf890De263B84189bd33EBe452", decimals: 18 },
};

/** Symbol or address in, {address, decimals, symbol} out — or null if unknown and not an address. */
export function resolveToken(ref: string | undefined): { address: string; decimals: number; symbol: string } | null {
  const r = (ref ?? "").trim();
  if (!r) return null;
  const bySymbol = KNOWN_TOKENS[r.toUpperCase()];
  if (bySymbol) return { ...bySymbol, symbol: r.toUpperCase() };
  if (/^0x[0-9a-fA-F]{40}$/.test(r)) {
    const hit = Object.entries(KNOWN_TOKENS).find(([, t]) => t.address.toLowerCase() === r.toLowerCase());
    return hit ? { ...hit[1], symbol: hit[0] } : { address: r, decimals: 18, symbol: "" };
  }
  return null;
}
