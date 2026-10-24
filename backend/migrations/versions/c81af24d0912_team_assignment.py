"""Add explicit shared-team assignments, preserving existing assignments."""

from alembic import op
import sqlalchemy as sa

revision = "c81af24d0912"
down_revision = "b62d11d9a240"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "tasks",
        sa.Column(
            "assign_all", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade():
    op.drop_column("tasks", "assign_all")
