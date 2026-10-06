const DATA = '__DATA_DIR__'; // injected by build_workflow.py (no $env needed)
const fs = require('fs');
const email = String(($json.query && $json.query.email) || '').trim().toLowerCase();
const ok = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email);
const page = (m) => `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial,sans-serif;max-width:520px;margin:15vh auto;padding:0 16px"><h2>${m}</h2></body>`;
if (!ok) return [{ json: { html: page('Invalid unsubscribe link.') } }];

const FILE = DATA + '/suppression.csv';
fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, 'email,reason,added_at\n');
const exists = fs.readFileSync(FILE, 'utf8').split(/\r?\n/).some((l) => l.split(',')[0].trim().toLowerCase() === email);
if (!exists) fs.appendFileSync(FILE, `${email},unsubscribed,${new Date().toISOString()}\n`);
return [{ json: { html: page('You have been unsubscribed. You will not receive further emails.') } }];
