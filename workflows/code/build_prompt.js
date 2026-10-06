const DATA = '__DATA_DIR__'; // injected by build_workflow.py (no $env needed)
// Builds one Anthropic /v1/messages request body per eligible row.
const fs = require('fs');
const cfg = $('Config').first().json;
const system = fs.readFileSync(DATA + '/prompts/system_prompt.txt', 'utf8');

const typeHint = {
  product: 'Promote only the product described in campaign_prompt.',
  service: 'Promote only the services described in campaign_prompt.',
  custom: 'Promote only what campaign_prompt describes.',
  excel: 'No campaign prompt is required. Build the email from the recipient fields.',
}[cfg.campaign_type] || 'Build the email from the recipient fields.';

return $input.all().map((it) => {
  const r = it.json;
  const payload = {
    campaign_type: cfg.campaign_type,
    campaign_instruction: typeHint,
    campaign_prompt: cfg.campaign_prompt || null,
    desired_call_to_action: cfg.call_to_action || null,
    tone: cfg.tone || null,
    sender: { name: cfg.sender_name },
    unsubscribe_url: r.unsubscribe_url,
    recipient: {
      first_name: r.first_name,
      last_name: r.last_name,
      full_name: r.full_name,
      company_name: r.company_name,
      observed_gap_or_signal: r.observed_gap,
      ai_web_opportunity_solution: r.solution,
      pitch_angle: r.pitch_angle,
    },
  };
  return {
    json: {
      ...r,
      request_body: {
  model: cfg.model,
  max_tokens: 1200,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: system },
    {
      role: 'user',
      content: 'Write one concise, factual outreach email. Return only the required JSON object. Include this opt-out sentence in both html_body and text_body: Reply to this email with UNSUBSCRIBE to stop future emails. Do not create or invent an unsubscribe link.\n\n' + JSON.stringify(payload, null, 2),
      },
      ],
     },
    },
  };
});
