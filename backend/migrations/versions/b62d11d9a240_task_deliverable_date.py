"""Add optional calendar dates to tasks without changing existing records."""

from alembic import op
import sqlalchemy as sa

revision = "b62d11d9a240"
down_revision = "7f0039251617"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tasks", sa.Column("deliverable_date", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("tasks", "deliverable_date")
