-- Spouští se jen při prvním startu prázdného volume (docker-entrypoint-initdb.d).
-- Testovací databáze — testy nikdy nesahají na reserved_dev.
CREATE DATABASE reserved_test OWNER dev;
