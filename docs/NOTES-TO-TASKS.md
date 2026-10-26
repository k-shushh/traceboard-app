# Notes to tasks

Save the note, choose **Find tasks with Groq**, review the suggestions, select
assignees if needed, then choose **Create selected tasks**. The backend sends
the saved note to Groq's chat completions endpoint. Creating tasks is a separate,
authenticated database operation after review. Repeating creation from the same
note skips titles already created from it.

**Use local suggestions instead** is an explicit offline alternative. It reads
numbered lists and rich-text list items, recognizes common change requests such
as Remove/Reduce/Put, and skips checked-off items and standalone mentions. Local
rules can also include contextual list items, so review the drafts before saving.

The hosted backend needs `GROQ_API_KEY`. `GROQ_MODEL` is optional and defaults to
`llama-3.3-70b-versatile`; blank values use the default and surrounding whitespace
is removed. After changing hosted environment variables, redeploy the backend.
Do not put keys in frontend variables or source control.

## Diagnosing a failed request

The UI and backend logs now include controlled diagnostic codes. No provider
response bodies, API keys, or note text are logged by this error handler.

| Code | Meaning / next action |
| --- | --- |
| `groq_not_configured` | Set the backend key and redeploy. |
| `groq_http_401` | Groq rejected the key; replace the hosted key and redeploy. |
| `groq_http_403` | Check Groq account and model permissions. |
| `groq_http_400` / `groq_http_404` | Check the selected model and JSON-output support. |
| `groq_http_429` | Wait for provider limits to reset or review account limits. |
| `groq_http_5xx` | Provider error; try again later. The code contains the actual status. |
| `groq_connection` / `groq_timeout` | Backend could not reach Groq or timed out. |
| `groq_invalid_output` / `groq_truncated` | Response failed validation or ran out of output tokens. |

The integration uses [Groq JSON object mode](https://console.groq.com/docs/structured-outputs)
with an explicit schema in the prompt and server-side Pydantic validation.
[Groq error codes](https://console.groq.com/docs/errors) distinguish authentication,
permissions, limits, and request errors.

## Verification on 2026-10-26

- 59 backend tests passed on the isolated local PostgreSQL test database, including project renaming checks.
- TypeScript checking and Vite production build passed.
- The supplied nine-item design note was tested as typed numbered paragraphs and
  as an editor ordered list. Both produced nine local drafts.
- The Groq HTTP contract, reviewed creation of nine tasks, privacy, persistence,
  and repeat-request duplicate prevention passed with mocked provider responses.
- A live Groq request and production deployment still require verification in the
  hosted environment. Mocked provider tests do not validate a production key.
