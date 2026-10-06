const cfg = $('Config').first().json;
const safeName = String(cfg.sender_name).replace(/["\r\n]/g, '');
return $input.all().map((it) => ({
  json: { ...it.json, from: `"${safeName}" <${cfg.sender_email}>`, reply_to: cfg.reply_to },
}));
