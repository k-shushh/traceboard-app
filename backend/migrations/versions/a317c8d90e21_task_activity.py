"""Task comments, subtask links, and deletion markers."""
from alembic import op
import sqlalchemy as sa

revision = "a317c8d90e21"
down_revision = "f251d9e0b632"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tasks", sa.Column("parent_task_id", sa.String(36), nullable=True))
    op.create_foreign_key("fk_tasks_parent_task_id", "tasks", "tasks", ["parent_task_id"], ["id"])
    op.create_index("ix_tasks_parent_task_id", "tasks", ["parent_task_id"])
    op.add_column("tasks", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table("task_activity",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_id", sa.String(36), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("converted_task_id", sa.String(36), sa.ForeignKey("tasks.id"), nullable=True),
    )
    op.create_index("ix_task_activity_task_id", "task_activity", ["task_id"])


def downgrade():
    op.drop_table("task_activity")
    op.drop_column("tasks", "deleted_at")
    op.drop_index("ix_tasks_parent_task_id", table_name="tasks")
    op.drop_constraint("fk_tasks_parent_task_id", "tasks", type_="foreignkey")
    op.drop_column("tasks", "parent_task_id")
