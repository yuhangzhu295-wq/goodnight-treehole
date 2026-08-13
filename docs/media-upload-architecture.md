# Media Upload Architecture

1. Browser file input accepts JPEG/PNG/WebP, validates MIME and 5 MB per file, renders `URL.createObjectURL` previews, and caps selection at two.
2. Multipart `POST /api/v1/media/upload` validates server-side, derives image dimensions, persists the file, then creates `MediaAsset`.
3. Mood publish accepts only owned, ready assets. Attachment IDs are copied to Mood, Post or Diary.
4. `GET /diaries` and `GET /diaries/:id` resolve IDs to real assets; admin posts resolve the same IDs and render the same URLs.
5. Draft-only `DELETE /api/v1/media/:id` removes both file and record; published attachments cannot be removed through this endpoint.
