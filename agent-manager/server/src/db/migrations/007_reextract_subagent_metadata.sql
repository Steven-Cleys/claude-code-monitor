-- Rows extracted right at SubagentStop miss the subagent's last tokens, and
-- older rows predate message-id dedup. NULL marks them for the one-off
-- re-extract at startup (reextractSubagentMetadata).
UPDATE subagent_metadata SET extracted_at = NULL;
