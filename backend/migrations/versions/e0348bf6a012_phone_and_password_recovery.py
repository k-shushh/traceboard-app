"""Phone login and admin-assisted password recovery."""

from alembic import op
import sqlalchemy as sa

revision = "e0348bf6a012"
down_revision = "d792a81be053"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("phone", sa.String(16), nullable=True))
    op.create_unique_constraint("uq_users_phone", "users", ["phone"])
    op.add_column(
        "users",
        sa.Column(
            "is_admin_account", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "temporary_password_expires_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    op.create_table(
        "password_reset_requests",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_table("password_reset_requests")
    op.drop_constraint("uq_users_phone", "users", type_="unique")
    for column in (
        "temporary_password_expires_at",
        "must_change_password",
        "is_admin_account",
        "phone",
    ):
        op.drop_column("users", column)
