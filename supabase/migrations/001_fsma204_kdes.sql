-- ============================================================
-- Migration: 001_fsma204_kdes.sql
-- Add optional FSMA 204 Key Data Elements (KDEs) to existing
-- trace_lots and trace_events tables.
--
-- All columns are NULLABLE — existing data is untouched.
-- Existing RLS policies on trace_lots / trace_events apply
-- automatically to the new columns (same table, same policy).
-- ============================================================

-- ── trace_lots: lot-level KDEs ──────────────────────────────
--   supplier_name  : free-text supplier name when no supplier
--                    record exists (FSMA 204 §1.1330(a)(4))
--   tlc_source     : who assigned the Traceability Lot Code
--                    (FSMA 204 §1.1330(a)(2) — "TLC source")

ALTER TABLE trace_lots
  ADD COLUMN IF NOT EXISTS supplier_name   text,
  ADD COLUMN IF NOT EXISTS tlc_source      text;

-- ── trace_events: event-level KDEs ──────────────────────────
--   reference_doc_type   : "BOL", "PO", "Invoice", "CMR", etc.
--                          (FSMA 204 reference document type)
--   reference_doc_number : Actual BOL/PO/invoice number
--   recipient_name       : Name of receiver (shipment events)
--                          (FSMA 204 §1.1340(a)(5))
--   recipient_location   : Physical delivery location
--                          (FSMA 204 §1.1340(a)(6))

ALTER TABLE trace_events
  ADD COLUMN IF NOT EXISTS reference_doc_type   text,
  ADD COLUMN IF NOT EXISTS reference_doc_number text,
  ADD COLUMN IF NOT EXISTS recipient_name       text,
  ADD COLUMN IF NOT EXISTS recipient_location   text;

-- No new RLS policies needed:
-- trace_lots and trace_events already have RLS by organization_id.
-- Supabase RLS applies at the row level; new columns are covered.

-- ── Verification query (run after applying migration) ───────
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name IN ('trace_lots', 'trace_events')
--   AND column_name IN (
--     'supplier_name','tlc_source',
--     'reference_doc_type','reference_doc_number',
--     'recipient_name','recipient_location'
--   )
-- ORDER BY table_name, column_name;
