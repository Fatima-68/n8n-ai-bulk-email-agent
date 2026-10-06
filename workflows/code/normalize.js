// Trim, lowercase email, map the documented Excel headers, keep the row number.
const cfg = $('Config').first().json;

return $input.all().map((it, i) => {
  // case-insensitive header lookup
  const map = {};
  for (const k of Object.keys(it.json)) map[k.trim().toLowerCase()] = it.json[k];
  const g = (...names) => {
    for (const n of names) {
      const v = map[n.toLowerCase()];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  };

  const first = g('first_name');
  const last = g('last_name');
  const email = g('email').toLowerCase();

  return {
    json: {
      row_number: i + 2, // Excel row (row 1 = headers)
      campaign_id: cfg.campaign_id,
      first_name: first,
      last_name: last,
      full_name: g('full_name') || [first, last].filter(Boolean).join(' '),
      company_name: g('company_name'),
      email,
      observed_gap: g('Observed Gaps/Signal', 'observed_gap'),
      solution: g('AI/ web Opportunity (Solution)', 'solution'),
      pitch_angle: g('Pitch Angle', 'pitch_angle'),
      consent_status: g('consent_status').toLowerCase(),
      unsubscribe_url:
        g('unsubscribe_url') ||
        (email ? `${cfg.unsubscribe_base}?email=${encodeURIComponent(email)}` : ''),
      send_status: g('send_status') || 'Pending',
      notes: g('notes'),
      // filled by Preview, edited by the operator, consumed by Send
      subject: g('subject'),
      preview_text: g('preview_text'),
      html_body: g('html_body'),
      text_body: g('text_body'),
      personalization_used: g('personalization_used'),
      risk_flags: g('risk_flags'),
    },
  };
});
