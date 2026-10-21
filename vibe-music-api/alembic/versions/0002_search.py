"""Enable accent-insensitive searching for the legacy music export."""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public")


def downgrade():
    # Extensions are database-wide and may also serve other application queries.
    # Do not drop a pre-existing shared extension on downgrade.
    pass
