"""Complete the twelve legacy business tables and add nullable media object keys."""

import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def identity():
    return sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True)


def reference(name, target, *, delete="CASCADE", update="CASCADE", nullable=False, primary=False):
    return sa.Column(
        name,
        sa.BigInteger(),
        sa.ForeignKey(target, ondelete=delete, onupdate=update),
        nullable=nullable,
        primary_key=primary,
    )


def upgrade():
    op.execute(
        "CREATE COLLATION IF NOT EXISTS public.legacy_ci "
        "(provider = icu, locale = 'und-u-ks-level1', deterministic = false)"
    )
    op.add_column("tb_artist", sa.Column("avatar_key", sa.String(1024)))
    op.add_column("tb_song", sa.Column("cover_key", sa.String(1024)))
    op.add_column("tb_song", sa.Column("audio_key", sa.String(1024)))
    op.create_table(
        "tb_admin",
        identity(),
        sa.Column("username", sa.String(20, collation="legacy_ci"), nullable=False, unique=True),
        sa.Column("password", sa.String(255), nullable=False),
    )
    op.create_table(
        "tb_user",
        identity(),
        sa.Column("username", sa.String(20, collation="legacy_ci"), nullable=False, unique=True),
        sa.Column("password", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(11, collation="legacy_ci"), unique=True),
        sa.Column("email", sa.String(128, collation="legacy_ci"), nullable=False, unique=True),
        sa.Column("user_avatar", sa.String(255)),
        sa.Column("introduction", sa.String(255)),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("update_time", sa.DateTime(), nullable=False),
        sa.Column("status", sa.SmallInteger(), nullable=False),
        sa.Column("avatar_key", sa.String(1024)),
    )
    op.create_table(
        "tb_style",
        identity(),
        sa.Column("name", sa.String(50, collation="legacy_ci"), nullable=False, unique=True),
    )
    op.create_table(
        "tb_playlist",
        identity(),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("cover_url", sa.String(255)),
        sa.Column("introduction", sa.Text()),
        sa.Column("style", sa.String(255)),
        sa.Column("cover_key", sa.String(1024)),
    )
    op.create_table(
        "tb_genre",
        reference("song_id", "tb_song.id", update="RESTRICT", primary=True),
        reference("style_id", "tb_style.id", update="RESTRICT", primary=True),
    )
    op.create_index("ix_tb_genre_style_id", "tb_genre", ["style_id"])
    op.create_table(
        "tb_playlist_binding",
        reference("playlist_id", "tb_playlist.id", update="RESTRICT", primary=True),
        reference("song_id", "tb_song.id", update="RESTRICT", primary=True),
    )
    op.create_index("ix_tb_playlist_binding_song_id", "tb_playlist_binding", ["song_id"])
    op.create_table(
        "tb_user_favorite",
        identity(),
        reference("user_id", "tb_user.id"),
        sa.Column("type", sa.SmallInteger(), nullable=False),
        reference("song_id", "tb_song.id", nullable=True),
        reference("playlist_id", "tb_playlist.id", nullable=True),
        sa.Column("create_time", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "tb_comment",
        identity(),
        reference("user_id", "tb_user.id"),
        reference("song_id", "tb_song.id", nullable=True),
        reference("playlist_id", "tb_playlist.id", nullable=True),
        sa.Column("content", sa.String(255), nullable=False),
        sa.Column("create_time", sa.DateTime(), nullable=False),
        sa.Column("type", sa.SmallInteger(), nullable=False),
        sa.Column("like_count", sa.BigInteger()),
    )
    for table in ("tb_user_favorite", "tb_comment"):
        for column in ("user_id", "song_id", "playlist_id"):
            op.create_index(f"ix_{table}_{column}", table, [column])
    op.create_table(
        "tb_banner",
        identity(),
        sa.Column("banner_url", sa.String(255), nullable=False),
        sa.Column("status", sa.SmallInteger(), nullable=False),
        sa.Column("banner_key", sa.String(1024)),
    )
    op.create_table(
        "tb_feedback",
        identity(),
        reference("user_id", "tb_user.id", delete="RESTRICT"),
        sa.Column("feedback", sa.String(255), nullable=False),
        sa.Column("create_time", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_tb_feedback_user_id", "tb_feedback", ["user_id"])


def downgrade():
    for table in (
        "tb_feedback",
        "tb_banner",
        "tb_comment",
        "tb_user_favorite",
        "tb_playlist_binding",
        "tb_genre",
        "tb_playlist",
        "tb_style",
        "tb_user",
        "tb_admin",
    ):
        op.drop_table(table)
    op.drop_column("tb_song", "audio_key")
    op.drop_column("tb_song", "cover_key")
    op.drop_column("tb_artist", "avatar_key")
