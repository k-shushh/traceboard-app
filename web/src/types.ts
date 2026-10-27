export type Status = 'todo' | 'progress' | 'done';
export type Priority = 'urgent' | 'high' | 'normal' | 'low';
export type Scope = 'team' | 'personal';
export type Member = { id: string; name: string; handle: string; role: string };
export type User = Member & {
  email: string;
  phone: string | null;
  is_admin_account: boolean;
  must_change_password: boolean;
  workspace_id: string;
};
export type Project = { id: string; name: string };
export type Task = {
  id: string;
  number: number;
  title: string;
  deliverable_date: string | null;
  description: string;
  status: Status;
  priority: Priority;
  kind: 'task' | 'bug' | 'experiment';
  private: boolean;
  assignee_id: string | null;
  assignee_ids: string[];
  assign_all: boolean;
  project_id: string | null;
  owner_id: string;
  source_note_id: string | null;
  parent_task_id?: string | null;
  position: number;
  version: number;
};
export type TaskInput = Pick<
  Task,
  | 'title'
  | 'deliverable_date'
  | 'description'
  | 'status'
  | 'priority'
  | 'kind'
  | 'private'
  | 'assignee_id'
  | 'assignee_ids'
  | 'assign_all'
  | 'project_id'
  | 'source_note_id'
>;
export type Note = {
  id: string;
  title: string;
  content: Record<string, unknown>;
  plain_text: string;
  private: boolean;
  project_id: string | null;
  owner_id: string;
  version: number;
  updated_at: string;
};
export type Notification = {
  id: string;
  message: string;
  read: boolean;
  task_id: string | null;
  note_id: string | null;
  created_at: string;
};
export type WorkspaceData = {
  workspace: { id: string; name: string };
  members: Member[];
  projects: Project[];
};
export const statuses: { id: Status; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
];
export const priorities: Priority[] = ['urgent', 'high', 'normal', 'low'];
export const initials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
