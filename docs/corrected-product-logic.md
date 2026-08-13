# Corrected Product Logic

- Write mood accepts only `content`, `emotion`, `visibility`, and up to two uploaded image attachments. Reply-style selection was removed.
- PRIVATE creates a Mood and Diary, never enters public posts, rejects human replies, feeds monthly statistics, and queues a `warm_letter` job.
- PUBLIC creates a reviewable Post and queues `public_ai_reply`; it becomes visible only after moderation. Human replies require both per-user privacy and global permission.
- AI style remains available only where it has user meaning: Today Letter, proactive letter generation, and AI tools.
- UI completion is never a toast-only substitute: upload, publish, moderation, and AI generation have persisted API outcomes.
