/**
 * Shared helpers for working with Claude Agent SDK event payloads.
 * Used by both WSHandler and FeishuBridge to avoid duplicate inline casts.
 */

/**
 * Extracts plain-text strings from a finalized "assistant" SDK event.
 * Returns an empty array for any other event type.
 *
 * Usage:
 *   const parts: string[] = [];
 *   onEvent: (event) => parts.push(...extractAssistantText(event)),
 *   onEnd:   () => forwardReply(parts.join("").trim()),
 */
export function extractAssistantText(event: unknown): string[] {
  const e = event as Record<string, unknown>;
  if (e.type !== "assistant") return [];
  const msg = e.message as
    | { content?: Array<Record<string, unknown>> }
    | undefined;
  const parts: string[] = [];
  for (const block of msg?.content ?? []) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text as string);
    }
  }
  return parts;
}
