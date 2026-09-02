-- lovable-cron-fallback-reviewed: 1440 runs/day; pre-existing minute-cadence omni-comms ingest worker, cadence unchanged; batch size corrected from invalid 50 to supported 25
SELECT cron.unschedule('omni-comms-business-event-ingest-every-minute');

SELECT cron.schedule(
  'omni-comms-business-event-ingest-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://xynceskeiiisiefqlgxo.supabase.co/functions/v1/omni-comms-business-event-ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5bmNlc2tlaWlpc2llZnFsZ3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQxMDAsImV4cCI6MjA4ODczMDEwMH0.kVVysArl8ujrAHpHLtNx7xifYyq02ulIE5c4WKKSXCI',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5bmNlc2tlaWlpc2llZnFsZ3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQxMDAsImV4cCI6MjA4ODczMDEwMH0.kVVysArl8ujrAHpHLtNx7xifYyq02ulIE5c4WKKSXCI',
      'x-omni-comms-ingest-ticket', 'scheduler',
      'x-omni-comms-scheduler-nonce', public.omni_comms_priv_scheduler_issue_ticket('business_event_ingest')
    ),
    body := jsonb_build_object('batchLimit', 25),
    timeout_milliseconds := 25000
  );
  $cron$
);