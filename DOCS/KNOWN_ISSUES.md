## Known Issues

- **ID Mismatch Loop:** Sync logic is inadvertently creating duplicate `life_areas` rows because new rows have `clickup_space_id` values while cleaner pre-existing rows retain rich context but lack ClickUp identifiers. The assistant keeps triggering the “Action Required” card due to the mismatch.
  - **Resolution:** Implement fuzzy-name matching in the ClickUp sync helper so a matched context-rich row gets patched with the ClickUp space ID rather than spawning a new record. This bridges the IDs into the existing rows and prevents duplicate life areas.
