-- Run this in Supabase SQL Editor → New query
-- Adds Cal.com configuration to the studios table

ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS cal_impression_url  text,
  ADD COLUMN IF NOT EXISTS cal_fitting_url     text,
  ADD COLUMN IF NOT EXISTS cal_webhook_secret  text;
