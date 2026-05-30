// Real bech32-checksummed bb1 addresses for unit tests. The validator now
// requires a valid bech32 checksum (#103), so the previous fake constants like
// `"bb1" + "d".repeat(39)` no longer pass. These are derived once from
// deterministic 20-byte payloads via `@cosmjs/encoding.toBech32`; shipped as
// constants so test files don't pull in @cosmjs/crypto.
export const TEST_BB1 = {
  DEST: "bb1mhwamhwamhwamhwamhwamhwamhwamhwapvmcpr",
  TO1: "bb15xs6rgdp5xs6rgdp5xs6rgdp5xs6rgdpq0qn07",
  TO2: "bb1k2et9v4jk2et9v4jk2et9v4jk2et9v4jz9s2mm",
  TO3: "bb1c0pu8s7rc0pu8s7rc0pu8s7rc0pu8s7ru273sg",
  AGENT: "bb1amhwamhwamhwamhwamhwamhwamhwamhww377f5",
  HUMAN: "bb1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zql3w7",
  RECIPIENT: "bb1yg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zda6hxf",
  BACKING: "bb1hwamhwamhwamhwamhwamhwamhwamhwamvay6jl",
} as const;
