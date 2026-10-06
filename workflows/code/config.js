// ===== EDIT THESE FIVE VALUES =====
const SENDER_NAME     = 'Your Company';              // shown as the From name
const SENDER_EMAIL    = 'your_email@gmail.com';             // must equal your SMTP username
const REPLY_TO        = 'your_email@gmail.com';             // a monitored inbox
const UNSUBSCRIBE_BASE = ''; // reply-based opt-out is used
const MODEL           = 'gemini-2.5-flash-lite'; // Gemini model string
const item = $input.first();
const f = item.json;

const keys = Object.keys(item.binary || {});
if (!keys.length) throw new Error('No Excel file was uploaded.');

const mode = String(f['Mode'] || 'Preview').trim();
const rawId = String(f['Campaign ID'] || '').trim();
if (mode === 'Send' && !rawId) {
  throw new Error('Send mode needs the Campaign ID printed by the Preview run (it is also in the review file name).');
}
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const campaignId = (rawId || 'camp_' + stamp).replace(/[^A-Za-z0-9_-]/g, '_');

return [{
  json: {
    mode,
    campaign_id: campaignId,
    campaign_type: String(f['Campaign Type'] || 'excel').trim().toLowerCase(),
    campaign_prompt: String(f['Campaign Prompt'] || '').trim(),
    call_to_action: String(f['Call To Action'] || '').trim(),
    tone: String(f['Tone'] || '').trim(),
    batch_size: Math.max(1, parseInt(f['Batch Size'], 10) || 1),
    wait_seconds: Math.max(0, parseInt(f['Seconds Between Batches'], 10) || 30),
    dry_run: String(f['Dry Run'] || 'Yes').toLowerCase().startsWith('yes'),
    sender_name: SENDER_NAME,
    sender_email: SENDER_EMAIL,
    reply_to: REPLY_TO,
    unsubscribe_base: UNSUBSCRIBE_BASE,
    model: MODEL,
  },
  binary: { data: item.binary[keys[0]] },
}];
