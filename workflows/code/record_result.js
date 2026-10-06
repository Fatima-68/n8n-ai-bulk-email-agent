const DATA = '__DATA_DIR__'; // injected by build_workflow.py (no $env needed)
// Runs right after "Send Email". Success items carry messageId; failures carry {error}.
const fs = require('fs');
const cfg = $('Config').first().json;
fs.mkdirSync(DATA + '/logs', { recursive: true });

return $input.all().map((it, i) => {
  const j = it.json;
  let row = {};
  try { row = $('Loop Over Items').itemMatching(i).json; } catch (e) {}
  const email = row.email || (j.accepted && j.accepted[0]) || (j.envelope && j.envelope.to && j.envelope.to[0]) || '';
  const failed = !!j.error || !j.messageId;
  const rec = {
    ts: new Date().toISOString(), run_id: $execution.id, campaign_id: cfg.campaign_id, mode: 'Send',
    email, row_number: row.row_number || null,
    status: failed ? 'failed' : 'sent',
    message_id: j.messageId || null,
    error: failed ? String((j.error && (j.error.message || j.error)) || 'no messageId returned').slice(0, 300) : null,
    attempt: 1,
  };
  fs.appendFileSync(DATA + '/logs/send_log.jsonl', JSON.stringify(rec) + '\n');
  return { json: rec };
});
