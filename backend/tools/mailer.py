"""Sends account emails. Without SMTP settings nothing is sent: the link is logged for the operator instead."""

import logging
import smtplib
from email.message import EmailMessage

from config import Settings

log = logging.getLogger("mothusi.mail")


def send_reset_email(settings: Settings, to: str, name: str, link: str) -> bool:
    """Returns True when an email was actually sent."""
    if not settings.smtp_host or not settings.smtp_from:
        log.warning("Password reset requested for %s; SMTP is not configured. Reset link: %s", to, link)
        return False
    msg = EmailMessage()
    msg["Subject"] = "Reset your Mothusi password"
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.set_content(
        f"Hello {name},\n\nSomeone asked to reset the password for your Mothusi account. "
        f"Open this link within one hour to choose a new password:\n\n{link}\n\n"
        "If you did not ask for this, you can ignore this email.\n"
    )
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password or "")
            smtp.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError):
        log.exception("Could not send the password reset email to %s", to)
        return False
