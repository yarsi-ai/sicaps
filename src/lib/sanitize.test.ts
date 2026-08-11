import { describe, it, expect } from 'vitest';
import { sanitizeUserInput, stripHtmlContent } from './sanitize';

describe('sanitizeUserInput', () => {
  it('strips null bytes and control characters', () => {
    const input = 'hello\x00world\x01test\x02end';
    expect(sanitizeUserInput(input)).toBe('helloworldtestend');
  });

  it('preserves newlines and tabs', () => {
    const input = 'line1\nline2\ttabbed';
    expect(sanitizeUserInput(input)).toBe('line1\nline2\ttabbed');
  });

  it('removes zero-width characters', () => {
    const input = 'hello\u200Bworld\uFEFFtest\u200Fend';
    expect(sanitizeUserInput(input)).toBe('helloworldtestend');
  });

  it('normalizes Unicode to NFC form', () => {
    // 'é' as e + combining acute accent (NFD) → single codepoint é (NFC)
    const nfd = 'e\u0301';
    const result = sanitizeUserInput(nfd);
    expect(result).toBe('\u00E9');
  });

  it('collapses excessive newlines to max 2', () => {
    const input = 'paragraph1\n\n\n\n\nparagraph2';
    expect(sanitizeUserInput(input)).toBe('paragraph1\n\nparagraph2');
  });

  it('trims leading and trailing whitespace', () => {
    const input = '   hello world   ';
    expect(sanitizeUserInput(input)).toBe('hello world');
  });

  it('preserves normal Indonesian text with special characters', () => {
    const input = 'Saya merasa gatal-gatal di kulit, terutama malam hari. Apakah ini skabies?';
    expect(sanitizeUserInput(input)).toBe(input);
  });

  it('handles empty string', () => {
    expect(sanitizeUserInput('')).toBe('');
  });

  it('handles string with only whitespace', () => {
    expect(sanitizeUserInput('   \n  \t  ')).toBe('');
  });
});

describe('stripHtmlContent', () => {
  it('removes script blocks entirely', () => {
    const input = 'before<script>alert("xss")</script>after';
    expect(stripHtmlContent(input)).toBe('beforeafter');
  });

  it('removes style blocks entirely', () => {
    const input = 'before<style>body { color: red; }</style>after';
    expect(stripHtmlContent(input)).toBe('beforeafter');
  });

  it('removes script blocks case-insensitively', () => {
    const input = 'before<SCRIPT type="text/javascript">code</SCRIPT>after';
    expect(stripHtmlContent(input)).toBe('beforeafter');
  });

  it('removes all HTML tags', () => {
    const input = '<p>Hello <strong>world</strong></p>';
    expect(stripHtmlContent(input)).toBe('Hello world');
  });

  it('removes self-closing tags', () => {
    const input = 'line1<br/>line2<hr/>end';
    expect(stripHtmlContent(input)).toBe('line1line2end');
  });

  it('decodes &amp; entity', () => {
    expect(stripHtmlContent('cats &amp; dogs')).toBe('cats & dogs');
  });

  it('decodes &lt; and &gt; entities', () => {
    expect(stripHtmlContent('a &lt; b &gt; c')).toBe('a < b > c');
  });

  it('decodes &quot; entity', () => {
    expect(stripHtmlContent('say &quot;hello&quot;')).toBe('say "hello"');
  });

  it('decodes &#39; entity', () => {
    expect(stripHtmlContent('it&#39;s fine')).toBe("it's fine");
  });

  it('handles nested and malformed tags', () => {
    const input = '<div><span>text</span></div><unclosed>';
    expect(stripHtmlContent(input)).toBe('text');
  });

  it('handles multiline script blocks', () => {
    const input = 'before<script>\nconsole.log("x");\nalert("y");\n</script>after';
    expect(stripHtmlContent(input)).toBe('beforeafter');
  });

  it('returns plain text unchanged', () => {
    const input = 'Saya merasa gatal di kulit';
    expect(stripHtmlContent(input)).toBe(input);
  });

  it('handles empty string', () => {
    expect(stripHtmlContent('')).toBe('');
  });
});
