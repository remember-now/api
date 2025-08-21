#!/bin/bash

# NOTE: This only runs when volume mounted to Postgres does not yet exist!

set -e
set -u

function create_user_and_database() {
    local database=$1
    local password=${2:-$database}
    echo "  Creating user and database '$database'"

    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        CREATE USER $database WITH PASSWORD '$password' CREATEDB;
        CREATE DATABASE $database;
        GRANT ALL PRIVILEGES ON DATABASE $database TO $database;
        \c $database
        GRANT ALL ON SCHEMA public TO $database;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $database;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $database;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $database;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $database;
        CREATE EXTENSION IF NOT EXISTS vector;
        ALTER DATABASE $database SET search_path TO public, vector;
EOSQL
}

if [ -n "$POSTGRES_MULTIPLE_DATABASES" ]; then
    echo "Multiple database creation requested: $POSTGRES_MULTIPLE_DATABASES"
    for db in $(echo $POSTGRES_MULTIPLE_DATABASES | tr ',' ' '); do
        IFS=':' read -r dbname dbpass <<< "$db"
        create_user_and_database $dbname $dbpass
    done
    echo "Multiple databases created"
fi