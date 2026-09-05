import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve(process.cwd(), 'src');

// Terms that must NOT appear in runtime customer-facing code
const FORBIDDEN_PATTERNS = [
  { pattern: /πρατήρ/i, name: 'Greek fuel station term (πρατήριο / πρατήρια / πρατηρίου)' },
  { pattern: /\bfuel station\b/i, name: 'English fuel station term' },
  { pattern: /\bgas station\b/i, name: 'English gas station term (customer-facing)' },
];

// Explicit allowlist for non-customer-facing technical compatibility identifiers
const ALLOWLIST = [
  'FUEL_STATION', // Category enum identifier
];

function scanDirectory(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else if (/\.(jsx?|tsx?|html|css)$/.test(entry.name)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const files = scanDirectory(SRC_DIR);
let violations = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Strip allowed technical enum identifiers before checking
    let strippedLine = line;
    for (const allowed of ALLOWLIST) {
      strippedLine = strippedLine.replaceAll(allowed, '');
    }

    for (const { pattern, name } of FORBIDDEN_PATTERNS) {
      if (pattern.test(strippedLine)) {
        console.error(
          `[TERMINOLOGY VIOLATION] ${name} found in ${path.relative(process.cwd(), file)}:${index + 1}\n  > ${line.trim()}`
        );
        violations++;
      }
    }
  });
}

if (violations > 0) {
  console.error(`\nProduct terminology validation failed with ${violations} violation(s).`);
  process.exit(1);
} else {
  console.log(`Product terminology validation passed. Scanned ${files.length} runtime files with zero customer-facing fuel station terms.`);
}
