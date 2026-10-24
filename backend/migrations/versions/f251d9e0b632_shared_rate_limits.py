"""Persist rate limits across serverless instances."""

from alembic import op
import sqlalchemy as sa

revision = "f251d9e0b632"
down_revision = "e0348bf6a012"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "rate_limits",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("hits", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_rate_limits_expires_at", "rate_limits", ["expires_at"])


def downgrade():
    op.drop_index("ix_rate_limits_expires_at", table_name="rate_limits")
    op.drop_table("rate_limits")
