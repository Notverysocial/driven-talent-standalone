-- Driven Talent — add 'phone' to the message_channel enum
--
-- The RingCentral integration mirrors matched inbound calls into the Inbox
-- by inserting a conversations row with channel='phone'
-- (src/lib/integrations/providers/ringcentral.ts → mirrorCallToInbox).
--
-- 'phone' was never a member of the message_channel enum
-- ('web_chat', 'sms', 'email', 'application'), so that insert failed and the
-- .select().single() returned null — mirrorCallToInbox bailed before writing
-- the message. Net effect: the inbound_calls row was stored, but the matched
-- call never surfaced as a readable Inbox conversation (the same class of
-- silent-enum-mismatch bug that the sender_type='system' → 'bot' fix closed
-- for messages).
--
-- This adds 'phone' so the RingCentral → Inbox mirror lands. Additive only.

alter type message_channel add value if not exists 'phone';
