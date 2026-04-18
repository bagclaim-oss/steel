import { DEFAULT_ANTHROPIC_MODEL, getSettings } from "./settings-manager.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const TITLE_PROMPT_PREFIX =
  "Generate a concise 3-5 word session title for this user request. Output only the title, no explanation.\n\nRequest: ";

function sanitizeTitle(raw: string): string | null {
  const title = raw.replace(/^"|"$/g, "").replace(/^'|'$/g, "").trim();
  if (!title || title.length >= 100) return null;
  return title;
}

async function generateViaCli(firstUserMessage: string, timeoutMs: number): Promise<string | null> {
  const truncated = firstUserMessage.slice(0, 500);
  const prompt = TITLE_PROMPT_PREFIX + truncated;
  try {
    const proc = Bun.spawn(["claude", "-p", prompt, "--output-format", "text"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const [text, exit] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    clearTimeout(timer);

    if (exit !== 0) return null;
    return sanitizeTitle(text.trim());
  } catch {
    return null;
  }
}

async function generateViaApi(
  firstUserMessage: string,
  timeoutMs: number,
  apiKey: string,
): Promise<string | null> {
  const settings = getSettings();
  const model = settings.anthropicModel?.trim() || DEFAULT_ANTHROPIC_MODEL;
  const truncated = firstUserMessage.slice(0, 500);
  const userPrompt = TITLE_PROMPT_PREFIX + truncated;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 256,
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[auto-namer] Anthropic request failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json() as {
      content?: Array<{ type: string; text?: string }>;
    };

    const raw = data.content?.[0]?.type === "text" ? (data.content[0].text ?? "") : "";
    return sanitizeTitle(raw);
  } catch (err) {
    console.warn("[auto-namer] Failed to generate session title via Anthropic:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generates a short session title.
 * Prefers the Anthropic API when an API key is configured.
 * Falls back to spawning the claude CLI (uses the CLI's own auth — no API key needed).
 */
export async function generateSessionTitle(
  firstUserMessage: string,
  _model: string,
  options?: { timeoutMs?: number },
): Promise<string | null> {
  const timeout = options?.timeoutMs || 15_000;
  const settings = getSettings();
  const apiKey = settings.anthropicApiKey.trim();

  if (apiKey) {
    return generateViaApi(firstUserMessage, timeout, apiKey);
  }

  // No API key — try the claude CLI (uses claude login / subscription auth)
  return generateViaCli(firstUserMessage, timeout);
}
