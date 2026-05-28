// Prompt-injection scanner (#24 T-02). Flags override-style instructions in
// content that gets ingested into persona memory and later injected into the
// system prompt (buildContext). A flagged memory is rendered as untrusted DATA,
// not trusted context, so a malicious document can't hijack the agent by
// embedding "ignore previous instructions". Conservative + heuristic: a false
// positive only costs a label (the text is never dropped), so we err toward
// flagging.
const PATTERNS: RegExp[] = [
  /\bignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier|preceding)\s+(?:instructions?|prompts?|messages?|rules?)\b/i,
  /\bdisregard\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above)?[^.\n]*\binstructions?\b/i,
  /\b(?:you\s+are\s+now|from\s+now\s+on,?\s+you\s+(?:are|will|must))\b/i,
  /\b(?:system|developer)\s+(?:prompt|message|instructions?)\b/i,
  /\boverride\s+(?:your|the|all)\s+(?:instructions?|rules?|system|prompt)\b/i,
  /\b(?:new|updated|revised)\s+(?:instructions?|rules?|system\s+prompt)\s*[:?]/i,
  /\breveal\s+(?:your|the)\s+(?:system\s+prompt|instructions?|mnemonic|private\s+key|seed\s+phrase)\b/i,
];

/** True if `text` contains override-style / prompt-injection instructions. */
export function scanForInjection(text: string): boolean {
  return PATTERNS.some((re) => re.test(text));
}
