const DATA = '__DATA_DIR__'; // injected by build_workflow.py (no $env needed)
const fs = require('fs');
const cfg = $('Config').first().json;
const rows = $('Build Review Rows').all().map((x) => x.json);

const skipped = [];
try {
  fs.readFileSync(DATA + '/logs/send_log.jsonl', 'utf8').split(/\r?\n/).filter(Boolean).forEach((l) => {
    try {
      const o = JSON.parse(l);
      if (o.run_id === $execution.id && o.status === 'skipped') skipped.push({ row: o.row_number, email: o.email, reason: o.reason });
    } catch (e) {}
  });
} catch (e) {}

const report = {
  campaign_id: cfg.campaign_id,
  mode: 'Preview',
  generated: rows.length,
  needs_review: rows.filter((r) => r.send_status === 'Needs Review').length,
  clean_pending_approval: rows.filter((r) => r.send_status === 'Pending').length,
  approved: 0,
  sent: 0,
  failed: 0,
  skipped: skipped.length,
  skipped_details: skipped,
  review_file: `data/files/reviews/${cfg.campaign_id}_review.xlsx`,
  next_step: 'Open the review file, edit text if needed, set send_status to Approved, clear risk_flags once fixed, then run the form again with Mode = Send and this campaign_id.',
};
fs.mkdirSync(DATA + '/reports', { recursive: true });
fs.writeFileSync(`${DATA}/reports/${cfg.campaign_id}_preview.json`, JSON.stringify(report, null, 2));
return [{ json: report }];
