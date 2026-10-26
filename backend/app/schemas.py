from typing import Literal, Annotated
from datetime import date
from pydantic import (
    BaseModel,
    Field,
    EmailStr,
    ConfigDict,
    StringConstraints,
    model_validator,
)

Password = Annotated[str, StringConstraints(strip_whitespace=False)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Register(Input):
    name: str = Field(min_length=2, max_length=80)
    handle: str = Field(pattern=r"^[a-z][a-z0-9_]{2,29}$")
    email: EmailStr
    password: Password = Field(min_length=12, max_length=128)
    workspace: str = Field(default="My workspace", min_length=2, max_length=80)
    invite: str | None = Field(default=None, max_length=100)


class Login(Input):
    email: EmailStr | None = None
    identifier: str | None = Field(default=None, min_length=1, max_length=254)
    mode: Literal["team", "admin"] = "team"
    password: Password = Field(min_length=1, max_length=128)

    @model_validator(mode="after")
    def login_identifier(self):
        if bool(self.email) == bool(self.identifier):
            raise ValueError("Provide one login identifier.")
        return self


class ResetRequestInput(Input):
    phone: str = Field(min_length=7, max_length=24)


class InviteInput(Input):
    email: EmailStr


class ProjectInput(Input):
    name: str = Field(min_length=2, max_length=100)


class ProjectEdit(ProjectInput):
    expected_name: str = Field(min_length=2, max_length=100)


class ProfileEdit(Input):
    name: str = Field(min_length=2, max_length=80)


class PasswordChange(Input):
    current_password: Password = Field(min_length=1, max_length=128)
    new_password: Password = Field(min_length=12, max_length=128)


class TaskInput(Input):
    title: str = Field(min_length=1, max_length=200)
    deliverable_date: date | None = None
    description: str = Field(default="", max_length=10000)
    status: Literal["todo", "progress", "done"] = "todo"
    priority: Literal["urgent", "high", "normal", "low"] = "normal"
    kind: Literal["task", "bug", "experiment"] = "task"
    assignee_id: str | None = None
    assignee_ids: list[str] | None = Field(default=None, max_length=100)
    assign_all: bool = False
    project_id: str | None = None
    private: bool = False
    source_note_id: str | None = None

    @model_validator(mode="after")
    def validate_assignment(self):
        if self.assign_all and (self.private or self.assignee_id or self.assignee_ids):
            raise ValueError(
                "Assign all requires a shared task with no individual assignee."
            )
        return self


class TaskEdit(TaskInput):
    version: int = Field(ge=1)


class Move(Input):
    status: Literal["todo", "progress", "done"]
    before_id: str | None = None
    version: int = Field(ge=1)


class NoteInput(Input):
    title: str = Field(min_length=1, max_length=200)
    content: dict = Field(
        default_factory=lambda: {"type": "doc", "content": [{"type": "paragraph"}]}
    )
    project_id: str | None = None
    private: bool = False


class NoteEdit(NoteInput):
    version: int = Field(ge=1)


class Draft(Input):
    title: str = Field(min_length=1, max_length=200)
    priority: Literal["urgent", "high", "normal", "low"] = "normal"
    assignee_id: str | None = None
    assignee_ids: list[str] | None = Field(default=None, max_length=100)
    assign_all: bool = False


class Convert(Input):
    version: int = Field(ge=1)
    drafts: list[Draft] = Field(min_length=1, max_length=10)
