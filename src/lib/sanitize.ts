/**
 * Sanitize user input before passing to LLM prompts.
 * Strips control characters, normalizes unicode, trims whitespace.
 */
export function sanitizeUserInput(input: string): string {
  // 1. Normalize Unicode to NFC form
  let sanitized = input.normalize('NFC');

  // 2. Strip control characters (U+0000–U+001F) except newline (0x0A) and tab (0x09)
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 3. Remove zero-width characters that could obfuscate content
  sanitized = sanitized.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');

  // 4. Collapse multiple consecutive newlines to max 2
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

  // 5. Trim leading/trailing whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Strip HTML content from a string.
 * Removes script/style blocks, all HTML tags, and decodes common entities.
 */
export function stripHtmlContent(input: string): string {
  // 1. Remove <script>...</script> and <style>...</style> blocks entirely
  let sanitized = input.replace(/<script[\s\S]*?<\/script>/gi, '');
  sanitized = sanitized.replace(/<style[\s\S]*?<\/style>/gi, '');
  // 2. Remove all remaining HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  // 3. Decode common HTML entities
  sanitized = sanitized
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return sanitized;
}
