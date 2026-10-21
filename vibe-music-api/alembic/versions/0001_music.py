"""Initial artist and song tables matching the legacy SQL export."""

import sqlalchemy as sa

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tb_artist",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("gender", sa.Integer()),
        sa.Column("avatar", sa.String(255)),
        sa.Column("birth", sa.Date()),
        sa.Column("area", sa.String(30)),
        sa.Column("introduction", sa.String(255)),
    )
    op.create_index("ix_tb_artist_name", "tb_artist", ["name"])
    op.create_table(
        "tb_song",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column(
            "artist_id",
            sa.BigInteger(),
            sa.ForeignKey("tb_artist.id", ondelete="CASCADE", onupdate="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("album", sa.String(255), nullable=False),
        sa.Column("lyric", sa.Text()),
        sa.Column("duration", sa.String(10)),
        sa.Column("style", sa.String(255)),
        sa.Column("cover_url", sa.String(255)),
        sa.Column("audio_url", sa.String(255)),
        sa.Column("release_time", sa.Date(), nullable=False),
    )
    op.create_index("ix_tb_song_artist_id", "tb_song", ["artist_id"])


def downgrade():
    op.drop_table("tb_song")
    op.drop_table("tb_artist")
