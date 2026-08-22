import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * lib/vision purity guard.
 *
 * CODING_STANDARDS §3.3: `lib/` is pure logic. It MUST NOT import Prisma,
 * services, or Next.js modules, and MUST NOT perform I/O.
 *
 * This exists because the rule was broken once: `vision-client.ts` called
 * `fetch()` here, rationalised as a "necessary exception". The HTTP call now
 * lives in `services/vision-api.service.ts` and this test keeps it there.
 *
 * Validates: Requirements 13.1
 */

const VISION_DIR = path.resolve(__dirname, '.');

const FORBIDDEN_IMPORTS = ['@/db/prisma', '@/services', 'next/', 'next-intl', '@prisma/client'];

/** I/O entry points that have no business appearing in a pure module. */
const FORBIDDEN_CALLS = [
  { pattern: /\bfetch\s*\(/, name: 'fetch()' },
  { pattern: /\bXMLHttpRequest\b/, name: 'XMLHttpRequest' },
  { pattern: /\bnew\s+AbortController\b/, name: 'AbortController' },
  { pattern: /\bsetTimeout\s*\(/, name: 'setTimeout()' },
  { pattern: /\bprocess\.env\b/, name: 'process.env' },
  { pattern: /\bfs\./, name: 'node:fs' },
];

function getSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getSourceFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractImports(content: string): string[] {
  const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const specifier = match[1];
    if (specifier !== undefined) imports.push(specifier);
  }
  return imports;
}

describe('lib/vision purity', () => {
  const sourceFiles = getSourceFiles(VISION_DIR);

  it('finds source files to check', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of sourceFiles) {
    const relativePath = path.relative(VISION_DIR, filePath);

    it(`${relativePath} imports no Prisma, service, or Next.js module`, () => {
      const imports = extractImports(fs.readFileSync(filePath, 'utf-8'));

      for (const imp of imports) {
        for (const forbidden of FORBIDDEN_IMPORTS) {
          expect(imp).not.toContain(forbidden);
        }
      }
    });

    it(`${relativePath} performs no I/O`, () => {
      const content = fs.readFileSync(filePath, 'utf-8');

      for (const { pattern, name } of FORBIDDEN_CALLS) {
        expect(pattern.test(content), `${relativePath} must not use ${name}`).toBe(false);
      }
    });
  }
});
