import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
const deleted = new Set(execFileSync('git', ['ls-files', '--deleted', '-z']).toString().split('\0'));
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).toString().split('\0').filter(file => file && !deleted.has(file));
let keys = [];
try {
  keys = Object.entries(parse(readFileSync('.env.local')))
    .filter(([name, value]) => /(?:KEY|TOKEN|SECRET|PASSWORD)$/.test(name) && value.length >= 8)
    .map(([, value]) => value);
} catch {}
const bad = files.filter(file => {
  if (/(^|\/)\.env($|\.)/.test(file) && !file.endsWith('.env.example')) return true;
  const content = readFileSync(file);
  return keys.some(key => content.includes(key)) || /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}/.test(content.toString());
});
if (bad.length) { console.error('Potential credential exposure in:', bad.join(', ')); process.exitCode = 1; }
else console.log('No keys detected in tracked or shareable untracked files.');
