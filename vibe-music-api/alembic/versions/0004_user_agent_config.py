"""Per-user encrypted model credentials; no shared key migration."""

import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tb_user_agent_config",
        sa.Column("user_id", sa.BigInteger(), primary_key=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("model_name", sa.String(200), nullable=False),
        sa.Column("encrypted_key", sa.Text(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["tb_user.id"], ondelete="CASCADE", onupdate="CASCADE"
        ),
    )


def downgrade():
    op.drop_table("tb_user_agent_config")
