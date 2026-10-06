// Shape generated drafts into the review spreadsheet (this file is re-uploaded in Send mode).
const cols = ['row_number', 'campaign_id', 'first_name', 'last_name', 'full_name', 'company_name', 'email',
  'consent_status', 'unsubscribe_url', 'send_status', 'subject', 'preview_text', 'text_body', 'html_body',
  'personalization_used', 'risk_flags', 'notes'];
return $input.all().map((it) => {
  const o = {};
  for (const c of cols) o[c] = it.json[c] ?? '';
  return { json: o };
});
