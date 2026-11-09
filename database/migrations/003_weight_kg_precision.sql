-- 003: weight kg precision
-- Runs once, in a transaction (so no BEGIN/COMMIT here). Never edit this file after
-- it is merged: add a new migration instead. See docs/database.md, "Migrations".

-- Weights entered in lb are stored in kg. At 0.1 kg, 180 lb became 81.6 kg and showed
-- back as 179.9 lb; at 0.01 kg every 0.1 lb survives the round trip.
ALTER TABLE users ALTER COLUMN weight_kg TYPE NUMERIC(5, 2);
