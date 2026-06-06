-- Migration 001: Initial schema + seed data
.read schema.sql
.read seed.sql
INSERT INTO schema_migrations VALUES ('001_initial', datetime('now'));
