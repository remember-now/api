#!/bin/bash
# Creates additional databases on the shared Postgres instance.
# Only runs on first volume init (when /docker-entrypoint-initdb.d/ executes).
set -euo pipefail

if [ -n "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
  for db in $(echo "$POSTGRES_MULTIPLE_DATABASES" | tr ',' ' '); do
    echo "Creating database '$db'"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -c "CREATE DATABASE \"$db\";"
  done
fi
