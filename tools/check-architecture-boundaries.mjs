import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const srcRoot = join(root, 'src');
const forbidden = [
  {
    id: 'ui_to_infrastructure',
    ownerSegment: `${sep}ui${sep}`,
    pattern: /from\s+['"][^'"]*infrastructure|import\s*\([^)]*['"][^'"]*infrastructure/,
    message: 'UI must not import infrastructure directly',
  },
  {
    id: 'domain_to_outer_layer',
    ownerSegment: `${sep}domain${sep}`,
    pattern: /from\s+['"][^'"]*(ui|application|infrastructure)|import\s*\([^)]*['"][^'"]*(ui|application|infrastructure)/,
    message: 'Domain must not import UI, application or infrastructure',
  },
  {
    id: 'application_to_infrastructure',
    ownerSegment: `${sep}application${sep}`,
    pattern: /from\s+['"][^'"]*infrastructure|import\s*\([^)]*['"][^'"]*infrastructure/,
    message: 'Application must depend on domain ports, not infrastructure',
  },
];

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const violations = [];
for (const file of walk(srcRoot)) {
  const normalized = file.split('/').join(sep).split('\\').join(sep);
  const text = readFileSync(file, 'utf8');
  for (const rule of forbidden) {
    if (normalized.includes(rule.ownerSegment) && rule.pattern.test(text)) {
      violations.push({ file: relative(root, file), rule: rule.id, message: rule.message });
    }
  }
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: 'fail', violations }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'pass', checkedFiles: walk(srcRoot).length, violations: [] }, null, 2));

