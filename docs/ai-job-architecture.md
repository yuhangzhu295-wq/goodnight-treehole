# AI Job Architecture

`queueAI` normalizes task aliases, creates a durable queued job, and schedules execution without holding the request open. Clients poll `GET /api/v1/ai/tasks/:id`.

Canonical task types: `public_ai_reply`, `warm_letter`, `emotion_analysis`, `negative_rewrite`, `rant`, `healing_phrase`, `sleep_comfort`, `work_support`, `future_letter`, `monthly_report`.

Ollama execution persists status transitions, provider/model, duration and structured output. `emotion_analysis` enforces the JSON contract. Template fallback is explicit (`fallback` status), never presented as an Ollama success.
