BEGIN;

ALTER TABLE dispatchers
    ALTER COLUMN designation SET DEFAULT 'Dispatcher';

COMMIT;