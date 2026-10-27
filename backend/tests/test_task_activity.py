import pytest
from test_workflows import pair, register, create


def add_comment(client, task, body="Investigate the edge case\nKeep the full details."):
    response = client.post(f"/api/tasks/{task['id']}/comments", json={"body": body})
    assert response.status_code == 201, response.text
    return response.json()


def convert(client, task, entry):
    return client.post(f"/api/tasks/{task['id']}/comments/{entry['id']}/subtask",
                       json={"title": "Investigate edge case"})


def remove(client, task, version=None):
    return client.request("DELETE", f"/api/tasks/{task['id']}",
                          json={"version": version or task["version"]})


@pytest.mark.parametrize("kind", ["task", "bug", "experiment"])
def test_comments_conversion_delete_and_number_history(clients, kind):
    owner, user, member, teammate = pair(clients)
    project = owner.post('/api/projects', json={"name": "Follow-ups"}).json()
    task = create(owner, kind=kind, assignee_ids=[teammate['id']], project_id=project['id'], priority='high')
    entry = add_comment(member, task)
    child = convert(member, task, entry).json()
    assert child['parent_task_id'] == task['id']
    assert child['description'] == entry['body']
    assert child['project_id'] == project['id']
    assert child['assignee_ids'] == [teammate['id']]
    assert child['priority'] == 'high' and child['status'] == 'todo'
    assert convert(owner, task, entry).json()['id'] == child['id']
    feed = owner.get(f"/api/tasks/{task['id']}/activity").json()
    comment = next(e for e in feed['entries'] if e['kind'] == 'comment')
    assert comment['author_name'] == teammate['name'] and comment['created_at']
    assert comment['body'] == entry['body'] and comment['converted_task']['id'] == child['id']
    assert len(feed['subtasks']) == 1
    assert remove(owner, task, 999).status_code == 409
    assert remove(owner, task).status_code == 200
    remaining = owner.get('/api/tasks').json()
    assert len(remaining) == 1 and remaining[0]['parent_task_id'] is None
    assert remaining[0]['version'] == child['version'] + 1
    assert owner.get(f"/api/tasks/{task['id']}/activity").status_code == 404
    assert owner.post(f"/api/tasks/{task['id']}/comments", json={'body':'gone'}).status_code == 404
    assert owner.post(f"/api/tasks/{task['id']}/move", json={'version':1,'status':'done'}).status_code == 404
    assert remove(owner, remaining[0]).status_code == 200
    assert create(owner)['number'] > child['number']


def test_private_and_cross_workspace_permissions(clients):
    owner, user, member, teammate = pair(clients)
    outsider = clients()
    register(outsider, 'outsider')
    task = create(owner, private=True)
    entry = add_comment(owner, task)
    for client in [member, outsider]:
        assert client.get(f"/api/tasks/{task['id']}/activity").status_code == 404
        assert client.post(f"/api/tasks/{task['id']}/comments", json={'body':'no'}).status_code == 404
        assert convert(client, task, entry).status_code == 404
        assert remove(client, task).status_code == 404
    child = convert(owner, task, entry).json()
    assert child['private'] and child['assignee_ids'] == [user['id']]
    assert member.get('/api/tasks').json() == []
    shared = create(owner)
    assert convert(owner, shared, entry).status_code == 404
    assert remove(outsider, shared).status_code == 404


def test_validation_activity_and_deleted_conversion(clients):
    owner, user, member, teammate = pair(clients)
    task = create(owner, assign_all=True)
    for body in ['', '   ', 'x' * 10001]:
        assert owner.post(f"/api/tasks/{task['id']}/comments", json={'body':body}).status_code == 422
    entry = add_comment(owner, task, 'Follow-up @sam')
    child = convert(owner, task, entry).json()
    assert child['assign_all'] and child['assignee_ids'] == []
    assert remove(owner, child).status_code == 200
    assert convert(owner, task, entry).status_code == 409
    assert owner.post(f"/api/tasks/{task['id']}/move", json={'version':1,'status':'done'}).status_code == 200
    feed = owner.get(f"/api/tasks/{task['id']}/activity").json()
    assert any('Changed status: todo → done' in e['body'] for e in feed['entries'])
    assert not feed['subtasks']
    assert next(e for e in feed['entries'] if e['kind'] == 'comment')['converted_task'] is None
    assert remove(owner, task).status_code == 409
    assert remove(owner, task, 2).status_code == 200
    assert all(n['task_id'] != task['id'] for n in member.get('/api/notifications').json())
