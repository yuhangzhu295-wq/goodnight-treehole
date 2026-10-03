# DAPI FINAL VERIFICATION

`DAPI_VERIFIED = false`
`BLOCKED_EXTERNAL`

## What was tested

`pnpm test:dapi-live`, which drives a real `AiJob` through the application's own provider
configuration — `DAPI_API_KEY`, `DAPI_BASE_URL`, `DAPI_MODEL` — and requires the job to end
`succeeded` with `providerId = provider_dapi_deepseek` and `fallbackUsed = false`.

Result: **failed**. The provider refuses the work:

```
POST /api/admin/v1/ai/providers/provider_dapi_deepseek/test
{"ok":false,"message":"Remote provider returned HTTP 402.",
 "item":{"ok":false,"providerId":"provider_dapi_deepseek","modelName":"deepseek-chat",
         "durationMs":0,"result":"Remote provider returned HTTP 402."}}
```

The secondary provider is also unusable:

```
POST /api/admin/v1/ai/providers/provider_openai_remote/test
{"ok":false,"message":"Remote provider returned HTTP 401."}
```

HTTP 402 is "payment required" — the DeepSeek account has no balance. HTTP 401 is an invalid key.
Neither is a code defect and neither can be fixed from inside the repository.

## Why this is not worked around

The round's rules forbid mocking DAPI, stubbing AI, substituting a different model for the product's
AI, falling back to a local model, or lowering the assertions. Nothing in this round did any of
those.

Two things make that easy to check rather than take on trust:

- **The AI execution policy has no local substitute available.** `provider_qwen` is
  `enabled=false` with base URL `disabled://local-model`; `OLLAMA_ENABLED=false`,
  `AI_LOCAL_MODEL_ENABLED=false`, `AI_ALLOW_OLLAMA_FALLBACK=false`. There is no model that could
  stand in for the product's AI even if someone wanted it to.
- **The failing assertions were left intact.** `tests/cross/cross.spec.ts` asserts
  `status: 'succeeded'`, `providerId: 'provider_dapi_deepseek'`, `fallbackUsed: false`; it is the only
  coverage of the real DAPI integration, so weakening it to accept a fallback would have deleted that
  coverage and made the gate lie. It still fails, and `QA_ALL_PASS` is reported as false because of it.

The evidence that the failure is environmental rather than a regression: the provider test above
returns 402 with `durationMs: 0` — the request never reached a model — and 117 of the 123 AI jobs in
the database are `fallback` with the message
`provider_dapi_deepseek:Remote provider returned HTTP 402`.

## What this blocks

| Gate | Status |
| --- | --- |
| `DAPI_VERIFIED` | false |
| `QA_ALL_PASS` | false — `test:cross` is the only failing step of 14 |
| `test:dapi-live` | fails |
| `test:peer-stage-*` (4 invocations of one spec) | fail on one assertion: the peer assist job must be `succeeded` |
| `test:third-stage-memory` | fails: an AI job must be `succeeded` |
| `test:third-stage-monthly-report` | fails: `expected 'fallback' to be 'succeeded'` |
| `tests/business/third-stage-monthly-report.spec.ts` | asserts a live `provider_dapi_deepseek` success; not part of `qa:all` |

These are all the same class: an assertion that a model answered. They are recorded as
`BLOCKED_EXTERNAL`, not as passes and not as product failures.

## What is verified instead

The **failure** path is verified, because in this environment it is the live path:

`work/verify-ai-degradation-ui.mjs` — 9/9, in a real browser:

| Check | Result |
| --- | --- |
| the remote model is genuinely unavailable (HTTP 402) | confirmed first, so the run is honest about its precondition |
| the tool result carries a visible degradation notice | present |
| the notice says the content is not a live model reply | "当前模型暂时不可用，下面是一段安全兜底内容，不是模型实时生成的回信。" |
| the real fallback content is still shown to the user | result card present |
| the emotion-decompose result carries the same notice | present |
| a real model answer produces no notice | `''` |
| a fallback job produces the notice | yes |
| a failed job produces its own notice | yes |
| `fallbackUsed` alone is enough to flag degradation | yes |

Also confirmed on the **native Android app** (`work/verify-android-rc.mjs`, 12/12): submitting a tool
task on the emulator shows the same notice, and the AI job is persisted in PostgreSQL
(`status=fallback`, `provider=provider_safe_template`).

The fallback logic is not a temporary shim for the outage: it is the behaviour that keeps a
distressed user from seeing a blank screen, and the round explicitly required it to be kept working
after DAPI recovers. The classifier is unit-checked for both directions, so when the account is funded
the success path will produce no notice and the fallback path will still produce one.

## What the owner has to do

1. Fund the DeepSeek account (or supply a working primary key and update `DAPI_API_KEY`).
2. Re-run `pnpm test:dapi-live` and `pnpm test:cross`.
3. Re-run `pnpm qa:all` — every other step already passes.
4. Re-run the AI-dependent suites listed above; they should then pass without any code change.

Nothing in the repository needs to change for that to work, which is the point: the product was left
in a state where a funded account is the only missing input.
