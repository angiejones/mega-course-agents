import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).toString().split('\0').filter(Boolean);
let key;
try { key = parse(readFileSync('.env.local')).OPENAI_API_KEY; } catch {}
const bad = files.filter(file => {
  if (/(^|\/)\.env($|\.)/.test(file) && !file.endsWith('.env.example')) return true;
  const content = readFileSync(file);
  return (key && content.includes(key)) || /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}/.test(content.toString());
});
if (bad.length) { console.error('Potential credential exposure in:', bad.join(', ')); process.exitCode = 1; }
else console.log('No keys detected in tracked or shareable untracked files.');
