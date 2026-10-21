"""Personal listening preferences."""

import sqlalchemy as sa

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tb_listening_history",
        sa.Column("user_id", sa.BigInteger(), primary_key=True),
        sa.Column("song_id", sa.BigInteger(), primary_key=True),
        sa.Column("play_count", sa.BigInteger(), nullable=False),
        sa.Column("last_played_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["tb_user.id"], ondelete="CASCADE", onupdate="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["song_id"], ["tb_song.id"], ondelete="CASCADE", onupdate="CASCADE"
        ),
    )
    op.create_index(
        "ix_listening_history_user_time", "tb_listening_history", ["user_id", "last_played_at"]
    )


def downgrade():
    op.drop_table("tb_listening_history")
