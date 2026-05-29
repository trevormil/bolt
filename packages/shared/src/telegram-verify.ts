const TELEGRAM_API = "https://api.telegram.org";

// Validate a Telegram bot token by calling getMe (#63), returning the bot's
// @username on success so a surface can confirm "✓ connected as @your_bot". A
// pure HTTP check with no telegram-runtime deps — so web setup/settings and the
// CLI wizard can all health-check a token before persisting it, mirroring how the
// OpenRouter key is verified (verifyOpenRouterKey). fetchImpl is injectable so
// the check is testable offline.
export async function verifyTelegramToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; username?: string }> {
  const t = token.trim();
  if (!t) return { ok: false };
  try {
    const res = await fetchImpl(`${TELEGRAM_API}/bot${t}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as {
      ok?: boolean;
      result?: { username?: string };
    };
    return body.ok
      ? { ok: true, username: body.result?.username }
      : { ok: false };
  } catch {
    // Unreachable / timeout → can't confirm, so don't accept it.
    return { ok: false };
  }
}
