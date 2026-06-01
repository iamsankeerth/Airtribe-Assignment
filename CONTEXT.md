# Draftly

Draftly is an automated writing assistant that syncs with a user's mail box to suggest contextual response drafts, analyze sent mail to learn the user's personal writing style, and manage safe, queue-based reply dispatching.

## Language

### Email Management

**Inbox Email**:
A mail message fetched from the user's linked inbox that represents a received message awaiting response.
_Avoid_: Message, raw email, database record.

**Reply Draft**:
An assistant-authored response proposed for a specific Inbox Email. A Reply Draft moves through a strict lifecycle of Suggested -> [Edited] -> Approved -> Sending -> Sent (or Failed/Retrying).
_Avoid_: Suggestion, content body, draft record.

### Channel & Identity

**Channel Connectivity**:
The authenticated and active connection state between Draftly and the external mail service provider.
_Avoid_: OAuth credentials, token storage, Google login.

**Audit Log**:
A chronological register of operations, automated decisions, and error states maintained for pipeline observability.
_Avoid_: DB log, system log, console output.

### Personalization

**Style Profile**:
A semantic profile capturing the user's personal writing patterns (tone distribution, sentence length, and repeatable phrases) to align draft voice with the user's natural communication style.
_Avoid_: AI parameters, settings object.

### Dispatching

**Send Queue**:
An asynchronous pipeline that schedules, executes, and retries the dispatch of Approved Reply Drafts, enforcing rate limits and failure back-offs.
_Avoid_: Cron job, setInterval loop, scheduler.
