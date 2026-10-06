const DATA = '__DATA_DIR__'; // injected by build_workflow.py (no $env needed)
// Compliance + data gate. Blocked rows are written to the audit log here.
const fs = require('fs');
const cfg = $('Config').first().json;
const LOG_DIR = DATA + '/logs';
const LOG = LOG_DIR + '/send_log.jsonl';
fs.mkdirSync(LOG_DIR, { recursive: true });

// suppression list (unsubscribes)
const suppressed = new Set();
try {
  fs.readFileSync(DATA + '/suppression.csv', 'utf8').split(/\r?\n/).slice(1).forEach((l) => {
    const e = l.split(',')[0].trim().toLowerCase();
    if (e) suppressed.add(e);
  });
} catch (e) { /* no file yet = empty list */ }

// idempotency: campaign_id + email must not be sent twice
const alreadySent = new Set();
try {
  fs.readFileSync(LOG, 'utf8').split(/\r?\n/).filter(Boolean).forEach((l) => {
    try {
      const o = JSON.parse(l);
      if (o.status === 'sent') alreadySent.add(o.campaign_id + '|' + o.email);
    } catch (e) {}
  });
} catch (e) {}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const seen = new Set();
const out = [];

for (const it of $input.all()) {
  const r = it.json;
  const reasons = [];

  const validEmail = emailRe.test(r.email);
  if (!validEmail) reasons.push('invalid_email');
  if (!['opted_in', 'legitimate_interest'].includes(r.consent_status)) reasons.push('compliance_block_no_consent');
  if (validEmail && suppressed.has(r.email)) reasons.push('suppressed_unsubscribed');
  if (validEmail) {
    if (seen.has(r.email)) reasons.push('duplicate_email');
    seen.add(r.email);
  }

  if (cfg.mode === 'Send') {
    if (String(r.send_status).toLowerCase() !== 'approved') reasons.push('not_approved');
    if (!r.subject || !r.text_body || !r.html_body) reasons.push('missing_generated_content');
    if (r.risk_flags) reasons.push('unresolved_risk_flags');
    if (alreadySent.has(r.campaign_id + '|' + r.email)) reasons.push('already_sent_in_campaign');
  }

  const blocked = reasons.length > 0;
  if (blocked) {
    fs.appendFileSync(LOG, JSON.stringify({
      ts: new Date().toISOString(), run_id: $execution.id, campaign_id: cfg.campaign_id,
      mode: cfg.mode, email: r.email, row_number: r.row_number,
      status: 'skipped', reason: reasons.join(', '),
    }) + '\n');
  }
  out.push({ json: { ...r, block_reason: reasons.join(', '), eligible: !blocked } });
}
return out;
