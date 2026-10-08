BEGIN;

ALTER TABLE salary_slips
    ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'not_sent'
        CHECK (email_status IN ('not_sent', 'sending', 'sent', 'failed')),
    ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email_sent_to TEXT,
    ADD COLUMN IF NOT EXISTS email_sent_by TEXT,
    ADD COLUMN IF NOT EXISTS email_last_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email_last_error TEXT;

COMMIT;