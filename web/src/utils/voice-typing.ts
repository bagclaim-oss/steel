/**
 * Typing animation utility for voice-driven UI interactions.
 *
 * Simulates a "someone is typing" effect by appending characters one
 * at a time to a React state setter, creating a visible animation.
 */

const DEFAULT_SPEED_MS = 25; // ms per character
const SPACE_PAUSE_MS = 10;   // extra pause on spaces (word boundary)

/**
 * Type text character by character into a React state setter.
 *
 * @param setText - Function to update the text state (supports updater pattern)
 * @param text - The full text to type
 * @param speed - Milliseconds per character (default: 25ms)
 * @returns Promise that resolves when all characters have been typed
 *
 * @example
 * ```ts
 * await typeText((fn) => setText(fn), "Hello world!", 30);
 * ```
 */
export function typeText(
  setText: (updater: (prev: string) => string) => void,
  text: string,
  speed: number = DEFAULT_SPEED_MS,
): Promise<void> {
  return new Promise((resolve) => {
    if (!text) {
      resolve();
      return;
    }

    let index = 0;

    function typeNextChar() {
      if (index >= text.length) {
        resolve();
        return;
      }

      const char = text[index];
      setText((prev) => prev + char);
      index++;

      // Slightly longer pause on spaces for natural rhythm
      const delay = char === " " ? speed + SPACE_PAUSE_MS : speed;
      setTimeout(typeNextChar, delay);
    }

    typeNextChar();
  });
}
