#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 --set app_password="$APP_DATABASE_PASSWORD" <<'SQL'
CREATE ROLE vibe LOGIN PASSWORD :'app_password';
ALTER DATABASE vibe_music OWNER TO vibe;
GRANT ALL ON SCHEMA public TO vibe;
SQL
