const DATA = '__DATA_DIR__'; // injected by build_workflow.py (no $env needed)
// Dry run: nothing is sent. Records what WOULD be sent.
const fs = require('fs');
const cfg = $('Config').first().json;
fs.mkdirSync(DATA + '/logs', { recursive: true });
return $input.all().map((it) => {
  const r = it.json;
  fs.appendFileSync(DATA + '/logs/send_log.jsonl', JSON.stringify({
    ts: new Date().toISOString(), run_id: $execution.id, campaign_id: cfg.campaign_id, mode: 'Send',
    email: r.email, row_number: r.row_number, status: 'dry_run', subject: r.subject,
  }) + '\n');
  return { json: { email: r.email, status: 'dry_run' } };
});
