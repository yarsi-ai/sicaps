import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Property 8: Domain Layer Isolation
 *
 * For any file in domain/, imports SHALL NOT reference application/,
 * adapters/, @/db/prisma, @/services, or next/
 *
 * Validates: Requirements 1.3, 1.4
 */

const DOMAIN_DIR = path.resolve(__dirname, '.');
const FORBIDDEN_IMPORTS = [
  'application/',
  'adapters/',
  '@/db/prisma',
  '@/services',
  'next/',
  'next-intl',
];

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractImports(content: string): string[] {
  const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
  const imports: string[] = [];
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

describe('Property 8: Domain Layer Isolation', () => {
  const domainFiles = getAllTsFiles(DOMAIN_DIR);

  it('domain directory has source files', () => {
    expect(domainFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of domainFiles) {
    const relativePath = path.relative(DOMAIN_DIR, filePath);

    it(`${relativePath} does not import from forbidden modules`, () => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const imports = extractImports(content);

      for (const imp of imports) {
        for (const forbidden of FORBIDDEN_IMPORTS) {
          expect(imp).not.toContain(forbidden);
        }
      }
    });
  }
});
