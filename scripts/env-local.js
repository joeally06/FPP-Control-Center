#!/usr/bin/env node
// Reads and writes .env.local for setup.sh, so values with characters like $ # & | \ or quotes
// survive. Next.js (dotenv + dotenv-expand) and the poller (dotenv) both read this file.
//
//   env-local.js write <file>        write every key below from the environment variables of the same name
//   env-local.js get <KEY> [file]    print one value (default file: .env.local); prints nothing if unset

const fs = require('fs');
const { parse } = require('dotenv');

const SECTIONS = [
  ['NextAuth Configuration', ['NEXTAUTH_URL', 'NEXTAUTH_SECRET']],
  [
    'Trusted Domains (comma-separated, for Cloudflare Tunnel or custom domains)\n' +
      '# Hostnames the browser may send as its Origin on POST/PUT/DELETE requests (CSRF check)\n' +
      '# Example: yourdomain.com,www.yourdomain.com',
    ['TRUSTED_DOMAINS'],
  ],
  ['Google OAuth', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']],
  ['Admin Emails (comma-separated)', ['ADMIN_EMAILS']],
  ['FPP Server Configuration', ['FPP_URL']],
  ['Spotify API', ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET']],
  ['Ollama LLM Configuration', ['OLLAMA_URL', 'NEXT_PUBLIC_OLLAMA_URL']],
  ['Email Configuration (SMTP)', ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS']],
  ['Timezone Configuration', ['NEXT_PUBLIC_TIMEZONE']],
  ['Internal API Key (for background jobs)', ['INTERNAL_API_KEY']],
];

// Characters that never need quoting or escaping in a .env file
const BARE = /^[A-Za-z0-9_@%+=:,./-]*$/;

function fail(message) {
  console.error(`env-local: ${message}`);
  process.exit(1);
}

// Next.js expands $VAR inside every value, quoted or not, and writes a literal $ as \$.
// dotenv ends an unquoted value at #, and turns a literal \n into a newline only inside "double quotes".
function formatValue(key, value) {
  if (/[\r\n]/.test(value)) fail(`${key} contains a line break, which a .env file cannot hold`);
  if (BARE.test(value)) return value;

  const escaped = value.replace(/\$/g, '\\$');
  if (!escaped.includes("'")) return `'${escaped}'`;
  if (!escaped.includes('`')) return `\`${escaped}\``;
  if (!escaped.includes('"') && !/\\[nr]/.test(escaped)) return `"${escaped}"`;
  return fail(`${key} contains ', " and \` together, which a .env file cannot hold`);
}

function write(file) {
  const blocks = SECTIONS.map(([title, keys]) => {
    const lines = keys.map((key) => `${key}=${formatValue(key, process.env[key] ?? '')}`);
    return `# ${title}\n${lines.join('\n')}\n`;
  });
  fs.writeFileSync(file, blocks.join('\n'), { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Not supported on every file system
  }
}

function get(key, file) {
  if (!fs.existsSync(file)) return;
  const value = parse(fs.readFileSync(file))[key];
  if (value !== undefined) process.stdout.write(value.replace(/\\\$/g, '$') + '\n');
}

const [command, ...args] = process.argv.slice(2);
if (command === 'write' && args[0]) {
  write(args[0]);
} else if (command === 'get' && args[0]) {
  get(args[0], args[1] || '.env.local');
} else {
  fail('usage: env-local.js write <file> | get <KEY> [file]');
}
