import { formatUnits, zeroAddress } from "viem";

export const NATIVE_TOKEN_SYMBOL = process.env.NEXT_PUBLIC_CHAIN_ID === "31337" ? "ETH" : "MNT";

export function isNativeToken(token: `0x${string}`) {
  return token.toLowerCase() === zeroAddress;
}

export function tokenMeta(token: `0x${string}`) {
  if (isNativeToken(token)) return { symbol: NATIVE_TOKEN_SYMBOL, decimals: 18 };
  return { symbol: "TOKEN", decimals: 18 };
}

export function formatTokenAmount(value: bigint, token: `0x${string}`) {
  const meta = tokenMeta(token);
  return `${trimDecimal(formatUnits(value, meta.decimals))} ${meta.symbol}`;
}

function trimDecimal(value: string) {
  return value.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}
