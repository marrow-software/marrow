# Contributing to Marrow

Thanks for being here. This document covers two things: **how** to contribute,
and — because you deserve a straight answer before you spend your time — **what
you're agreeing to** when you do.

---

## The honest part, first

**Marrow is solo-maintained.** One person. That shapes everything below.

**Marrow requires a CLA.** Before your first pull request can be merged, you'll
sign the [Marrow Individual Contributor License Agreement](./CLA.md). A bot
handles it; it takes one comment.

**Here's what the CLA actually does.** You keep the copyright on your code — the
CLA is a license, not an assignment. But it grants Marrow the right to license
your contribution under *any* terms, including commercial ones. In practice
that means: **a future version of Marrow could ship under a non-open licence,
and your contribution could be in it.**

**You should know why that's there.** CLAs have scar tissue. HashiCorp, Elastic
and Redis all had exactly this machinery in place, and all three used it to
relicense away from the communities that helped build them. If you're the kind
of person who evaluates a self-hosted knowledge base on whether it respects
your ownership of your own data, you are exactly the kind of person who
remembers that. You would work this out on your own. We'd rather tell you.

**What it's actually for:** Marrow is trying to be a sustainable product built
by one person. The CLA keeps commercial options open on *future* work. That's
the whole reason. There's no plan on the table today — but pretending the
option isn't there would be dishonest, and the option is worth more than the
pretence.

**And here's the part that isn't optional.** Every version of Marrow already
released is Apache 2.0, **irrevocably**. That's not a promise of good
behaviour, it's how the Apache License works — a released version can't be
un-released. Section 2a of the CLA states it explicitly anyway: nothing in the
CLA authorises us to retroactively change the licence of anything already
published. If Marrow ever did relicense, every release up to that day stays
free, forkable, and yours. That is the guarantee, and it's the same guarantee
whether you like the direction the project takes or not.

If that trade isn't one you want to make, that's a completely reasonable call,
and no hard feelings. Filing issues, reporting bugs, and writing docs are all
still enormously useful and none of them need a CLA.

---

## The restore guarantee

Before you write any code, read the
**[restore guarantee](./docs/src/content/docs/concepts/restore-guarantee.md)**.

Marrow's entire architecture flows from one non-negotiable property: an export
bundle must always restore to an exact replica of the original workspace. Any
contribution that compromises the export/restore round-trip will not be merged,
regardless of how good the rest of it is. `api/tests/test_round_trip.py` is the
regression anchor — it must pass at all times.

The other core constraints, in brief:

1. **Restore guarantee** — `marrow restore <bundle.zip>` reproduces a workspace
   exactly. A failing restore test is a critical bug.
2. **Append-only revisions** — saves create new revisions; existing revisions
   are never modified or deleted. A database trigger enforces this. Don't
   remove it.
3. **Transparent export format** — bundles stay human-readable without tooling
   (Markdown + JSON, no proprietary blobs).
4. **Pluggable storage** — business logic goes through the storage adapter
   interface. Never call filesystem APIs directly from routers or models.

---

## Getting set up

Full instructions are in [`README.md`](./README.md) and
[`CLAUDE.md`](./CLAUDE.md). The short version:

```bash
docker compose up -d                  # PostgreSQL 16 on port 5433

cd api
python -m venv venv && source venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head
uvicorn main:app --reload             # http://localhost:8000

cd web
npm install
npm run dev                           # http://localhost:3000
```

---

## Making a change

**Open an issue first.** Especially for features. Marrow has a deliberately
narrow active scope, and an issue is much cheaper than a rejected PR. If
you're picking up something already filed, say so on the issue so nobody
duplicates your work.

**Branch off `main`.** Use `feature/<short-description>` or
`fix/<short-description>`. Don't work directly on `main`.

**Keep it focused.** One concern per PR. A drive-by reformat bundled with a
behaviour change is very hard to review and much slower to merge.

**Update the docs.** If you change routes, schema, components, environment
variables, or architectural decisions, update `CLAUDE.md` in the same PR. It's
living documentation, not an afterthought.

---

## Before you open the PR

Everything below runs in CI. Running it locally first saves you a round trip.

```bash
cd api && ruff check .          # lint
cd api && ruff format .         # format
cd api && pytest                # integration tests — needs a running database

cd web && npm run lint
cd web && npm run build

cd docs && npm run build
```

Backend tests are **integration tests** and hit a real database — a fresh test
database is created per run and dropped afterwards. `FakeStorageAdapter` keeps
them off the filesystem.

---

## Opening the PR

1. Push your branch and open a pull request against `main`.
2. **Sign the CLA** when the bot asks. One comment, once, covers all your
   future contributions:

   ```
   I have read the CLA Document and I hereby sign the CLA
   ```

   Your signature is recorded in
   [`.github/cla/signatures.json`](https://github.com/marrow-software/marrow/blob/cla-signatures/.github/cla/signatures.json)
   on the `cla-signatures` branch — a plain readable file in this repository,
   not in a third party's storage.

3. Wait for CI. The CLA check and the test suite both have to be green.
4. Expect review comments. Solo maintenance means reviews can take a few days.

---

## Reporting bugs and security issues

**Bugs:** open a GitHub issue with what you expected, what happened, and enough
detail to reproduce it. If it involves export or restore, please attach the
bundle if you can share it — that's the highest-priority class of bug in this
project.

**Security vulnerabilities:** please do **not** open a public issue. Report
privately via GitHub's
[security advisory](https://github.com/marrow-software/marrow/security/advisories/new)
form.

---

## Licence

Marrow is [Apache 2.0](./LICENSE). Contributions are accepted under the
[Marrow ICLA](./CLA.md).

<!-- CI probe for #280: observing CLA status-check context name. This branch/PR is throwaway. -->
