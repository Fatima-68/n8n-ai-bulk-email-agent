# n8n AI Bulk Email Agent (Gemini + Gmail SMTP)

Excel upload → validation (consent, duplicates, suppression, MX lookup, bounce history, daily cap) → Gemini drafts each email → **human review and approval** → pre-send safety re-check → throttled Gmail SMTP send → audit log and report. An IMAP watcher records hard bounces so those addresses are never emailed again.

Built from `n8n_ai_bulk_email_agent_guide.docx` and extended during development.

> **Use responsibly.** Only email people you have a lawful basis to contact. `consent_status` in the spreadsheet is *your* statement about that basis, and the workflow blocks any row that doesn't say `opted_in` or `legitimate_interest`. Rules on unsolicited commercial email differ by country. This project is not legal advice.

## How it works

```
Form (Preview / Send) → Config → Read Excel → Normalize → Validate → Eligible?
                                                                      ├─ no  → logged as skipped
  Preview ──→ Gemini drafts → parse + risk checks → review .xlsx / .csv → report
  Send ─────→ Prepare Send → Dry Run? ─ yes → dry-run log → report
                                      └ no  → pre-send re-check → Gmail SMTP → log → wait → loop → report

IMAP trigger → detects permanent bounces (5.x.x) → adds address to suppression.csv
```

Two modes, always in this order:
1. **Preview** generates drafts and sends nothing.
2. **Send** delivers only rows you marked `Approved` in the reviewed file.

## Project layout

```
start-n8n.bat / start-n8n.sh   start n8n (npm install) with the settings this project needs
docker-compose.yml             optional: n8n + external task runner in Docker
n8n-task-runners.json          runner allow-list for the Docker setup
.env.example                   settings for scripts/test_smtp.py and docker-compose
workflows/
  bulk_email_agent.json        IMPORT THIS: main workflow (includes the IMAP bounce branch)
  unsubscribe_webhook.json     optional: link-based opt-out endpoint (not used by default)
  code/*.js, build_workflow.py original generator, see "Editing the workflow" below
scripts/
  validate_leads.py            pre-flight check of a leads .xlsx
  test_smtp.py                 verify Gmail SMTP login outside n8n
  make_sample_leads.py         create sample files
sample/                        example leads with placeholder addresses
data/files/
  prompts/system_prompt.txt    the AI instruction (edit freely, no re-import needed)
  reviews/  reports/  logs/    outputs (git-ignored)
  suppression.csv              unsubscribed and hard-bounced addresses (git-ignored)
```

## 1. Setup

### Option A: npm, no Docker (Windows)
1. Install Node.js 22 LTS (n8n supports 20.19 to 24.x). Check `node -v`.
2. `npm install -g n8n@2`
3. Start n8n **only** with the project script, from the project folder:
   ```powershell
   cd <project folder>
   .\start-n8n.bat
   ```
   It prints `Data folder: ...` and `Allowlist: ...`. The allow-list must include **`fs,path,dns,crypto`**: `fs` for logs and suppression files, `dns` for the MX lookup. Do not start n8n with plain `n8n start`.
4. Open http://localhost:5678, create the owner account, and keep the terminal open. n8n only runs while it is open. Stop it with `Ctrl+C`, answer `Y`, and make sure no `node.exe` for n8n is left running before starting again.

### Option B: Docker with an external task runner
Code nodes run in a task runner. In external mode, the module allow-list is read from the runner's config file, not from environment variables. This project ships it as `n8n-task-runners.json` (allows `fs,path,dns,dns/promises,crypto`) and mounts it in `docker-compose.yml`.
1. Copy `.env.example` to `.env`; set `N8N_VERSION` (same tag for both images) and `RUNNERS_TOKEN` (a long random string).
2. `docker compose up -d`, then open http://localhost:5678.
3. The data folder inside the containers is `/files`. After importing the workflow, replace the data path in the Code nodes accordingly (see "Point the workflow at your folder").
The Docker n8n has its own database, so import the workflow and create credentials again.

### Import the workflow
1. In n8n: **Workflows → Import from file → `workflows/bulk_email_agent.json`**.
2. **Point the workflow at your folder.** The exported JSON contains the data folder in every Code node and in the *Save Review File* node as `YOUR_PATH/data/files`. Replace it with your absolute path using forward slashes, for example `C:/Users/you/n8n-bulk-email-agent/data/files`. In PowerShell, from the project folder:
   ```powershell
   $p = (Resolve-Path .\data\files).Path -replace '\\','/'
   $utf8 = New-Object System.Text.UTF8Encoding($false)
   foreach ($f in Get-ChildItem .\workflows\*.json) {
     $t = [System.IO.File]::ReadAllText($f.FullName) -replace 'YOUR_PATH/data/files', $p
     [System.IO.File]::WriteAllText($f.FullName, $t, $utf8)
   }
   ```
   Do this *before* importing. For Docker, use `/files` instead of `$p`.
3. Open the **Config** node and set the constants at the top:
   ```js
   const SENDER_NAME      = 'Your Name';
   const SENDER_EMAIL     = 'you@gmail.com';   // must equal your SMTP username
   const REPLY_TO         = 'you@gmail.com';   // an inbox you actually read
   const UNSUBSCRIBE_BASE = '';                // empty = reply-based opt-out (default)
   const MODEL            = 'gemini-3.1-flash-lite'; // plain model id, no spaces or quotes inside
   ```

## 2. Credentials (inside n8n only, never in Excel, JSON or git)

| Credential | Type | Used by | Settings |
|---|---|---|---|
| Gemini | Header Auth | **Gemini Generate Email** | Name `x-goog-api-key`, Value = your Gemini API key (aistudio.google.com) |
| Gmail SMTP | SMTP | **Send Email (Gmail SMTP)** | Host `smtp.gmail.com`; Port **465** with SSL/TLS **on** (or 587 with SSL/TLS off); User = full Gmail address; Password = Google **App Password** |
| Gmail IMAP | IMAP | **Email Trigger (IMAP)** | Host `imap.gmail.com`; Port **993**; SSL/TLS on; same user and App Password |

- SMTP *sends*; IMAP *reads* (it is only used by the bounce watcher).
- An App Password needs 2-Step Verification on the Google account. Enter it as 16 characters with no spaces. Reuse one App Password for SMTP and IMAP, but create a separate n8n credential for each.
- Check the SMTP login first with `python scripts/test_smtp.py --send` (copy `.env.example` to `.env` and fill it in).
- Some Google Workspace accounts have SMTP/IMAP or App Passwords disabled by the admin; use a personal Gmail to test.

## 3. Run a campaign

The Gemini node retries up to 5 times with a 5-second wait, which absorbs temporary 429/503 overload errors.

1. **Prepare the leads file.** First sheet named `Leads`. Headers:
   `first_name, last_name, full_name, company_name, email, Observed Gaps/Signal, AI/ web Opportunity (Solution), Pitch Angle, consent_status, unsubscribe_url, send_status, notes`.
   Leave `unsubscribe_url` empty (opt-out is by reply). Check it first: `python scripts/validate_leads.py <file>`.
2. **Preview.** Open the workflow, click **Execute workflow**, and fill the form: Mode = Preview, Campaign ID **empty**, Campaign Type, optional prompt / call to action / tone, Batch Size 1, Seconds Between Batches (default 60), Dry Run = Yes, upload the file.
   In test mode the form link works for one submission; click **Execute workflow** again before each upload. A published workflow uses the production form URL.
3. **Read the outputs.**
   - `data/files/reviews/<campaign_id>_review.xlsx` (and `_review.csv` with the preflight columns `mx_status`, `bounce_status`, `unsubscribe_status`, `preflight_status`, `block_reason`)
   - `data/files/reports/<campaign_id>_preview.json`
4. **Review every draft.** Edit wording, remove claims you cannot back up, set `send_status` to `Approved`, and clear `risk_flags` once fixed. Rows with text in `risk_flags` never send.
5. **Send.** Mode = Send, the **same Campaign ID**, upload the *reviewed* file. Run once with **Dry Run = Yes** and check the report, then with **No (really send)**. Keep Batch Size at 1 and 30+ seconds between sends.
6. **Results.** `data/files/reports/<id>_send_*.json` and the full audit log `data/files/logs/send_log.jsonl`.

## 4. Safety checks

| Case | Result |
|---|---|
| invalid email | skipped, logged `invalid_email` |
| no / unknown `consent_status` | `compliance_block_no_consent` |
| duplicate email | only the first row proceeds |
| address in `suppression.csv` | `suppressed_unsubscribed` |
| domain has no mail server (MX lookup) | `mx_check_fail_no_mx_records` |
| DNS module not allowed or lookup error | `mx_check_unknown_...`, blocked in Send mode |
| earlier hard bounce recorded | `bounce_status_hard_bounce`, blocked |
| not Approved / missing content / text in `risk_flags` | skipped |
| already sent in this campaign | `already_sent_in_campaign` (idempotency on `campaign_id + email`) |
| more than **30 sent in the last 24 hours** | `daily_cap_reached` (`DAILY_CAP` in the **Validate** node) |
| invalid AI JSON, failed API call, bad word count, missing opt-out line, unsupported claim (%, "guarantee", "case study") | marked `Needs Review` and flagged in `risk_flags` |
| address added to suppression or hard-bounced after validation | the **pre-send check** stops the run before SMTP |
| SMTP failure | logged `failed` with the error; sent rows are not repeated on re-run |

MX status `pass` only means the domain accepts mail. It does **not** prove the mailbox exists. Spam-trap and blacklist checks are not performed; use an email-verification service on lists you didn't collect yourself.

## 5. Opt-out and bounces

**Opt-out is by reply.** Every email ends with: *"Reply to this email with UNSUBSCRIBE to stop future emails."* There is no link. When someone replies, add them to `data/files/suppression.csv`:
```
email,reason,added_at
someone@example.com,unsubscribed,2026-10-02
```
Every later run skips that address. (The optional **Unsubscribe Handler** workflow is only needed if you set a public HTTPS `UNSUBSCRIBE_BASE`; `localhost` links work only on your own machine.)

**Hard bounces are recorded automatically** by the **Email Trigger (IMAP)** branch. It reads new (`UNSEEN`) mail in `INBOX`, looks for delivery-failure notices with permanent `5.x.x` status codes, and appends the failed recipient to `suppression.csv` with reason `hard_bounce`. It leaves the messages untouched. Requirements:
- the workflow must be **published (active)** and n8n must be running, otherwise the trigger isn't listening;
- the IMAP credential must work (test it on the trigger node).

Some `5.7.x` rejections (blocked as spam, policy) reflect your sending reputation, not a dead mailbox, but are suppressed too. That is the cautious choice.

## 6. Wiring checklist (common mistakes)

- **Loop Over Items → pre-send check (the Code node before the send) → Send Email (Gmail SMTP)** must be connected. If the last link is missing, nothing is sent.
- **Wait** node: unit must be **Seconds**.
- The send-failure detection in **Validate** and the pre-send check uses `/\b5\.\d\.\d\b|\b55\d\b/`, so a port number such as 587 isn't mistaken for a bounce code.

## 7. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Module 'fs' is disallowed` or `access to env vars denied` | n8n wasn't started with the project's settings, or an old n8n process is still running. Stop all n8n processes, then run `.\start-n8n.bat` (the output must show the `Allowlist:` line). To stop leftovers: `Get-CimInstance Win32_Process -Filter "name='node.exe'" \| Where-Object { $_.CommandLine -match 'n8n' } \| ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`. If you use the Docker setup, the allow-list lives in `n8n-task-runners.json`. |
| `mx_status` = `unknown_dns_module_unavailable` | `dns` is not on the allow-list. Use `fs,path,dns,crypto` and restart n8n. In code use `require('dns').promises` (not `dns/promises`). |
| Gemini `400 ... unexpected model name format` | `MODEL` has a space, quote or `models/` prefix. Use a plain id like `gemini-3.1-flash-lite`. |
| Gemini `404` / model not found | That model isn't available to your key. List models in AI Studio and use another. |
| Gemini `503` / `429` | Temporary overload or quota. Wait and re-run; keep Batch Size 1. |
| `invalid_json_from_ai` in `risk_flags` | Answer was cut off or malformed. Re-run; `maxOutputTokens` is 8192 in **Build Prompt**. |
| SMTP `535 Username and Password not accepted` | Not an App Password, a space in it, or 2-Step Verification is off. |
| SMTP connection hangs | Port/SSL mismatch (465 ↔ SSL on, 587 ↔ SSL off) or a VPN/firewall. |
| Send mode skips every row | Read `reason` in the last lines of `logs/send_log.jsonl`: usually `not_approved`, `unresolved_risk_flags`, or uploading the original leads file instead of the *reviewed* file. |
| `404 workflow ... only access workflows owned by you` | A stale browser tab. Open `http://localhost:5678/home/workflows`. |
| File not writable / not in allowed path | `N8N_RESTRICT_FILE_ACCESS_TO` must point at `data/files`; start with the script. |

## 8. Editing the workflow

After the initial build, the workflow was changed inside n8n: Gemini instead of the first AI provider, reply-based opt-out, MX lookup and daily cap in **Validate**, a pre-send re-check, and the IMAP bounce branch. **`workflows/bulk_email_agent.json` is therefore the source of truth.** To change it, edit in n8n, then **⋯ → Download** and replace the file in the repo.

`workflows/code/*.js` and `build_workflow.py` are the original generator and no longer match the exported workflow. Don't regenerate from them, or you will lose these changes. Remove them or keep them only as reference.

Before committing a downloaded workflow, replace your own name, Gmail address and folder path with placeholders (`Your Name`, `you@gmail.com`, `YOUR_PATH/data/files`).

## 9. Sharing and git hygiene

- `.env`, `data/files/logs`, `reviews`, `reports` and `suppression.csv` are git-ignored. Never commit real lead lists, send logs, review files, API keys or App Passwords.
- Keep spreadsheets in `sample/` limited to placeholder or your own test addresses (for example `you+test1@gmail.com`).
- Before pushing, scan for leftovers:
  ```powershell
  Get-ChildItem -Recurse -File -Include *.json,*.js,*.py,*.md,*.txt,*.bat,*.sh,*.yml,*.csv |
    Select-String -Pattern "AIza|sk-ant|your-real-address|F:/"
  ```
  Spreadsheets are not searched by this command; open them and check by eye.

## Limits and next steps

- Gmail caps daily sending and flags sudden bulk patterns. Start with a handful of recipients and grow slowly. For larger volumes use a transactional provider (Amazon SES, Postmark, Resend) with your own domain, SPF, DKIM, DMARC and a `List-Unsubscribe` header (n8n's SMTP node can't set custom headers).
- Add an email-verification service (for example NeverBounce or ZeroBounce) before sending to lists you didn't collect yourself.
- Possible extensions from the guide: a dashboard, a database for contacts and suppression, reply classification, A/B tests.