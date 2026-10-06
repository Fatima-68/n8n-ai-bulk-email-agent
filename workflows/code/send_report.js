const DATA = '__DATA_DIR__'; // injected by build_workflow.py (no $env needed)
const fs = require('fs');
const cfg = $('Config').first().json;
const latest = {};
const skipped = [];
try {
  fs.readFileSync(DATA + '/logs/send_log.jsonl', 'utf8').split(/\r?\n/).filter(Boolean).forEach((l) => {
    try {
      const o = JSON.parse(l);
      if (o.run_id !== $execution.id) return;
      if (o.status === 'skipped') skipped.push({ row: o.row_number, email: o.email, reason: o.reason });
      else latest[o.email] = o;
    } catch (e) {}
  });
} catch (e) {}
const vals = Object.values(latest);
const report = {
  campaign_id: cfg.campaign_id,
  mode: 'Send',
  dry_run: cfg.dry_run,
  sent: vals.filter((v) => v.status === 'sent').length,
  failed: vals.filter((v) => v.status === 'failed').length,
  would_send_dry_run: vals.filter((v) => v.status === 'dry_run').length,
  skipped: skipped.length,
  skipped_details: skipped,
  failures: vals.filter((v) => v.status === 'failed').map((v) => ({ email: v.email, error: v.error })),
};
fs.mkdirSync(DATA + '/reports', { recursive: true });
fs.writeFileSync(`${DATA}/reports/${cfg.campaign_id}_send_${$execution.id}.json`, JSON.stringify(report, null, 2));
return [{ json: report }];
