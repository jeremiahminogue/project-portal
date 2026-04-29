-- Align uploaded-photo digest delivery with Vercel Hobby's once-daily cron limit.

alter table notification_rules
  drop constraint if exists notification_rules_digest_frequency_check;

alter table notification_rules
  add constraint notification_rules_digest_frequency_check
  check (digest_frequency in ('immediate', 'hourly', 'daily'));

update notification_rules
set digest_frequency = 'daily'
where event_type = 'photo.uploaded'
  and recipient_kind = 'photo_subscribers'
  and digest_frequency = 'hourly';
