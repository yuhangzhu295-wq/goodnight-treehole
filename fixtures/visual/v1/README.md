# Visual fixture v1

This is committed synthetic source data for visual acceptance, never a copy of live PostgreSQL rows or `data/uploads`.

`pnpm visual:fixture:bootstrap` creates a separate PostgreSQL cluster on 55433. `pnpm visual:fixture:start` launches API 3001, front 5175, admin 5176, and an Ollama-compatible fixture stub on 11435. Runtime data, media, screenshots, and reports live only below `artifacts/visual-fixtures/v1/`.

The bootstrap script refuses the live PostgreSQL port/database, the live uploads directory, and an unmarked runtime identity before it writes anything.
