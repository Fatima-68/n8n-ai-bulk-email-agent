// Parse + validate the model output. Anything doubtful -> "Needs Review".
const out = [];
const claimRe = /\bguarantee[sd]?\b|\b\d{1,3}(?:\.\d+)?\s?%|\bcase stud(?:y|ies)\b|\btrusted by\b|\b(?:clients|customers) (?:like|such as)\b|\bROI of\b/i;

$input.all().forEach((it, i) => {
  const { request_body, ...row } = $('Build Prompt').itemMatching(i).json;
  const issues = [];
  let d = {};

  if (it.json.error || !Array.isArray(it.json.content)) {
    const msg = (it.json.error && (it.json.error.message || JSON.stringify(it.json.error))) || 'no content returned';
    issues.push('ai_call_failed: ' + String(msg).slice(0, 200));
  } else {
    try {
      let t = it.json.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      const a = t.indexOf('{'), b = t.lastIndexOf('}');
      d = JSON.parse(t.slice(a, b + 1));
    } catch (e) {
      issues.push('invalid_json_from_ai');
    }
  }

  if (!issues.length) {
    for (const k of ['subject', 'preview_text', 'html_body', 'text_body', 'personalization_used', 'risk_flags']) {
      if (d[k] === undefined || d[k] === null) issues.push('missing_key:' + k);
    }
    const subject = String(d.subject || '');
    const text = String(d.text_body || '');
    const words = text.split(/\s+/).filter(Boolean).length;
    if (subject.length < 3 || subject.length > 70) issues.push('subject_length:' + subject.length);
    if (words < 90 || words > 150) issues.push('word_count:' + words);
    if (!/unsubscribe|opt[- ]?out/i.test(text)) issues.push('missing_unsubscribe_text');
    if (row.unsubscribe_url && !(String(d.html_body).includes(row.unsubscribe_url) && text.includes(row.unsubscribe_url))) {
      issues.push('missing_unsubscribe_link');
    }
    const m = (subject + ' ' + text).match(claimRe);
    if (m) issues.push('possible_unsupported_claim:' + m[0]);
    if (Array.isArray(d.risk_flags)) d.risk_flags.forEach((x) => issues.push('ai_flag:' + x));
  }

  out.push({
    json: {
      ...row,
      subject: String(d.subject || ''),
      preview_text: String(d.preview_text || ''),
      html_body: String(d.html_body || ''),
      text_body: String(d.text_body || ''),
      personalization_used: String(d.personalization_used || ''),
      risk_flags: issues.join('; '),
      send_status: issues.length ? 'Needs Review' : 'Pending',
    },
  });
});
return out;
