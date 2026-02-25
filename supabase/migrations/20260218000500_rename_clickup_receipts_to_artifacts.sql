-- Rename the audit log table from "clickup_receipts" to "clickup_artifacts"
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clickup_receipts') THEN
    ALTER TABLE clickup_receipts RENAME TO clickup_artifacts;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clickup_receipts_list_config_id_fkey'
  ) THEN
    ALTER TABLE clickup_artifacts
      RENAME CONSTRAINT clickup_receipts_list_config_id_fkey
      TO clickup_artifacts_list_config_id_fkey;
  END IF;
END$$;
