"""Verifies Gmail SMTP login (and optionally sends a test mail) OUTSIDE n8n,
so you know the credentials are right before wiring them into n8n.

  python scripts/test_smtp.py            # login only
  python scripts/test_smtp.py --send     # also sends a test email to TEST_RECIPIENT

Reads settings from .env (see .env.example).
SMTP = SENDING. IMAP/POP3 = RECEIVING. Only SMTP matters for sending.
  port 465 -> implicit SSL (SMTP_SSL)      port 587 -> plain connect then STARTTLS
"""
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage
from pathlib import Path


def load_env():
    p = Path(".env")
    if p.exists():
        for line in p.read_text().splitlines():
            if line.strip() and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def main():
    load_env()
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "465"))
    user = os.getenv("SMTP_USER", "")
    pwd = os.getenv("SMTP_APP_PASSWORD", "").replace(" ", "")
    if not user or not pwd:
        sys.exit("Set SMTP_USER and SMTP_APP_PASSWORD in .env first.")
    ctx = ssl.create_default_context()
    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, context=ctx, timeout=30)
        else:
            server = smtplib.SMTP(host, port, timeout=30)
            server.ehlo()
            server.starttls(context=ctx)
            server.ehlo()
        server.login(user, pwd)
        print(f"OK: logged in to {host}:{port} as {user}")
        if "--send" in sys.argv:
            to = os.getenv("TEST_RECIPIENT")
            if not to:
                sys.exit("Set TEST_RECIPIENT in .env to use --send.")
            msg = EmailMessage()
            msg["From"] = f'{os.getenv("FROM_NAME", "Test")} <{user}>'
            msg["To"], msg["Reply-To"], msg["Subject"] = to, user, "SMTP test from n8n bulk email project"
            msg.set_content("If you can read this, Gmail SMTP sending works.")
            server.send_message(msg)
            print(f"OK: test email sent to {to}")
        server.quit()
    except smtplib.SMTPAuthenticationError as e:
        sys.exit(f"AUTH FAILED ({e.smtp_code}). Use a Google App Password (needs 2-Step Verification), not your normal password.")
    except (smtplib.SMTPException, OSError) as e:
        sys.exit(f"CONNECTION/SMTP ERROR: {e}\nCheck host/port pairing: 465 needs SSL, 587 needs STARTTLS; also firewalls/VPN.")


if __name__ == "__main__":
    main()
