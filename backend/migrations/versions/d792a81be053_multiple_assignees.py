"""Store explicit task assignees with foreign keys; preserve existing assignments."""

from alembic import op
import sqlalchemy as sa

revision = "d792a81be053"
down_revision = "c81af24d0912"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "task_assignees",
        sa.Column(
            "task_id",
            sa.String(36),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True
        ),
    )
    op.create_index("ix_task_assignees_user_id", "task_assignees", ["user_id"])
    op.execute(
        "INSERT INTO task_assignees (task_id, user_id) SELECT id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL"
    )


def downgrade():
    op.drop_table("task_assignees")
