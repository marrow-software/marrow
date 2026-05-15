#!/usr/bin/env python3
"""
Parallel worktree swarm coordinator for Marrow.

Dispatches multiple Claude Code agents in isolated git worktrees to implement
GitHub issues concurrently, with conflict detection, batch scheduling, shared
state, and a dashboard.

Usage:
    python scripts/swarm.py --issues 127,133,135   # run specific issues
    python scripts/swarm.py                         # auto-select from v0.2 milestone
    python scripts/swarm.py --issues 127,133 --dry-run   # preview plan only
    python scripts/swarm.py --issues 127,133 --no-cleanup  # keep worktrees after

Kill switch:
    touch .swarm/KILL    # stops coordinator after the current batch finishes
"""

import argparse
import fcntl
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).parent.parent.resolve()
SWARM_DIR = REPO_ROOT / ".swarm"
WORKTREES_DIR = SWARM_DIR / "worktrees"
STATE_FILE = SWARM_DIR / "state.json"
KILL_FILE = SWARM_DIR / "KILL"
LOGS_DIR = SWARM_DIR / "logs"

HAIKU = "claude-haiku-4-5-20251001"
SONNET = "claude-sonnet-4-6"
OPUS = "claude-opus-4-7"

LARGE_FILE_THRESHOLD = 10    # files — escalate to opus above this
LARGE_LINE_THRESHOLD = 500   # estimated diff lines — escalate to opus above this

AGENT_TIMEOUT = 1800  # 30 minutes per agent


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class IssueFootprint:
    number: int
    title: str
    body: str
    files: list[str] = field(default_factory=list)
    estimated_lines: int = 0
    model: str = SONNET


@dataclass
class AgentResult:
    issue: int
    branch: str
    worktree_path: str
    status: str  # running | done | failed | killed | dry-run
    pr_url: Optional[str] = None
    test_passed: bool = False
    conflicts: list[str] = field(default_factory=list)
    error: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None


# ---------------------------------------------------------------------------
# State manager — thread-safe JSON with fcntl file locking
# ---------------------------------------------------------------------------

class StateManager:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()

    def write(self, data: dict) -> None:
        with self._lock:
            with open(self.path, "w") as f:
                fcntl.flock(f, fcntl.LOCK_EX)
                json.dump(data, f, indent=2)
                fcntl.flock(f, fcntl.LOCK_UN)

    def read(self) -> dict:
        with self._lock:
            if not self.path.exists():
                return {}
            with open(self.path) as f:
                fcntl.flock(f, fcntl.LOCK_SH)
                data = json.load(f)
                fcntl.flock(f, fcntl.LOCK_UN)
            return data

    def update_agent(self, issue: int, updates: dict) -> None:
        with self._lock:
            if not self.path.exists():
                return
            with open(self.path, "r+") as f:
                fcntl.flock(f, fcntl.LOCK_EX)
                data = json.load(f)
                data.setdefault("agents", {})
                data["agents"].setdefault(str(issue), {})
                data["agents"][str(issue)].update(updates)
                f.seek(0)
                json.dump(data, f, indent=2)
                f.truncate()
                fcntl.flock(f, fcntl.LOCK_UN)


# ---------------------------------------------------------------------------
# Coordinator
# ---------------------------------------------------------------------------

class SwarmCoordinator:
    def __init__(self, repo_root: Path, dry_run: bool = False):
        self.repo_root = repo_root
        self.dry_run = dry_run
        self.base_sha = self._resolve_base_sha()
        SWARM_DIR.mkdir(exist_ok=True)
        WORKTREES_DIR.mkdir(exist_ok=True)
        LOGS_DIR.mkdir(exist_ok=True)
        self.state = StateManager(STATE_FILE)
        self._setup_signal_handlers()

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    def _resolve_base_sha(self) -> str:
        try:
            out = subprocess.check_output(
                ["git", "rev-parse", "v0.2"],
                cwd=self.repo_root,
                stderr=subprocess.DEVNULL,
            )
            return out.strip().decode()
        except subprocess.CalledProcessError:
            # Fallback: HEAD
            out = subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=self.repo_root
            )
            sha = out.strip().decode()
            print(f"[swarm] WARNING: tag v0.2 not found, using HEAD ({sha[:12]})")
            return sha

    def _setup_signal_handlers(self) -> None:
        if KILL_FILE.exists():
            KILL_FILE.unlink()

        def _handle(signum, frame):
            print("\n[swarm] Signal received — activating kill switch.")
            KILL_FILE.touch()

        signal.signal(signal.SIGINT, _handle)
        signal.signal(signal.SIGTERM, _handle)

    def is_killed(self) -> bool:
        return KILL_FILE.exists()

    # ------------------------------------------------------------------
    # Issue fetching
    # ------------------------------------------------------------------

    def fetch_issues(self, numbers: Optional[list[int]] = None) -> list[dict]:
        if numbers:
            issues = []
            for n in numbers:
                r = subprocess.run(
                    ["gh", "issue", "view", str(n),
                     "--json", "number,title,body,labels"],
                    cwd=self.repo_root, capture_output=True, text=True, check=True,
                )
                issues.append(json.loads(r.stdout))
        else:
            r = subprocess.run(
                ["gh", "issue", "list",
                 "--milestone", "v0.2",
                 "--state", "open",
                 "--json", "number,title,body,labels",
                 "--limit", "50"],
                cwd=self.repo_root, capture_output=True, text=True, check=True,
            )
            issues = json.loads(r.stdout)

        # Skip issues that already have an open swarm PR
        already_done = self._issues_with_open_prs()
        if already_done:
            before = len(issues)
            issues = [i for i in issues if i["number"] not in already_done]
            skipped = before - len(issues)
            if skipped:
                print(f"[swarm] Skipping {skipped} issue(s) with existing open PRs: "
                      f"{sorted(already_done & {i['number'] for i in issues} | already_done)}")
        return issues

    def _issues_with_open_prs(self) -> set[int]:
        """Return issue numbers that already have an open swarm/issue-N PR."""
        r = subprocess.run(
            ["gh", "pr", "list",
             "--base", "v0.2",
             "--json", "headRefName",
             "--limit", "200"],
            cwd=self.repo_root, capture_output=True, text=True,
        )
        if r.returncode != 0:
            return set()
        nums: set[int] = set()
        for pr in json.loads(r.stdout):
            m = re.match(r"swarm/issue-(\d+)$", pr["headRefName"])
            if m:
                nums.add(int(m.group(1)))
        return nums

    # ------------------------------------------------------------------
    # Footprint analysis
    # ------------------------------------------------------------------

    def analyze_footprint(self, issue: dict) -> IssueFootprint:
        """Ask haiku to identify which repo files the issue likely touches."""
        prompt = (
            "Analyze this GitHub issue and return ONLY a JSON object (no markdown) with:\n"
            '- "files": list of relative file paths in the repo likely to be modified\n'
            '- "estimated_lines": rough integer estimate of total lines changed\n'
            '- "symbols": list of key function/class names mentioned\n\n'
            f"Issue #{issue['number']}: {issue['title']}\n\n"
            f"Body:\n{issue['body'][:3000]}"
        )

        result = subprocess.run(
            ["claude", "-p", prompt,
             "--model", HAIKU,
             "--no-session-persistence"],
            cwd=self.repo_root,
            capture_output=True, text=True, timeout=90,
        )

        files: list[str] = []
        estimated_lines: int = 100

        raw = result.stdout.strip()
        # Strip markdown code fences if haiku wrapped the JSON
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE)

        try:
            data = json.loads(raw)
            files = [f for f in data.get("files", []) if isinstance(f, str)]
            estimated_lines = int(data.get("estimated_lines", 100))
        except (json.JSONDecodeError, ValueError):
            # Fallback: grep the repo for symbols mentioned in the body
            files = self._grep_symbols(issue["body"])
            estimated_lines = 100

        model = self._select_model(files, estimated_lines)

        return IssueFootprint(
            number=issue["number"],
            title=issue["title"],
            body=issue["body"],
            files=files,
            estimated_lines=estimated_lines,
            model=model,
        )

    def _select_model(self, files: list[str], estimated_lines: int) -> str:
        if len(files) > LARGE_FILE_THRESHOLD or estimated_lines > LARGE_LINE_THRESHOLD:
            return OPUS
        return SONNET

    def _grep_symbols(self, text: str) -> list[str]:
        """Fallback: grep the codebase for identifiers mentioned in the issue."""
        tokens = re.findall(r"\b[A-Za-z_][A-Za-z_0-9]{3,}\b", text)
        stop = {
            "that", "this", "with", "from", "have", "will", "should", "must",
            "when", "then", "also", "each", "into", "there", "which", "their",
            "about", "after", "before", "where", "these", "those", "what",
        }
        tokens = list(dict.fromkeys(
            t for t in tokens if t.lower() not in stop
        ))[:10]

        found: set[str] = set()
        for token in tokens:
            r = subprocess.run(
                ["grep", "-rl", "--include=*.py", "--include=*.ts",
                 "--include=*.tsx", "--include=*.md", token,
                 "api/", "web/", "docs/"],
                cwd=self.repo_root, capture_output=True, text=True,
            )
            for line in r.stdout.splitlines():
                path = line.strip()
                if path and not any(
                    skip in path
                    for skip in ("__pycache__", ".pyc", "node_modules", ".next", ".venv")
                ):
                    found.add(path)

        return sorted(found)[:20]

    # ------------------------------------------------------------------
    # Conflict graph + batch partitioning
    # ------------------------------------------------------------------

    def build_conflict_graph(
        self, footprints: list[IssueFootprint]
    ) -> dict[int, set[int]]:
        """Return adjacency dict: issue_num -> set of conflicting issue_nums."""
        graph: dict[int, set[int]] = {fp.number: set() for fp in footprints}
        for i, fp1 in enumerate(footprints):
            for fp2 in footprints[i + 1:]:
                if set(fp1.files) & set(fp2.files):
                    graph[fp1.number].add(fp2.number)
                    graph[fp2.number].add(fp1.number)
        return graph

    def partition_batches(
        self,
        footprints: list[IssueFootprint],
        graph: dict[int, set[int]],
    ) -> list[list[IssueFootprint]]:
        """Greedy graph coloring: pack issues into the earliest non-conflicting batch."""
        fp_map = {fp.number: fp for fp in footprints}
        assignment: dict[int, int] = {}

        for fp in footprints:
            used = {assignment[n] for n in graph[fp.number] if n in assignment}
            batch = 0
            while batch in used:
                batch += 1
            assignment[fp.number] = batch

        num_batches = max(assignment.values(), default=-1) + 1
        batches: list[list[IssueFootprint]] = [[] for _ in range(num_batches)]
        for num, idx in assignment.items():
            batches[idx].append(fp_map[num])
        return batches

    # ------------------------------------------------------------------
    # Worktree lifecycle
    # ------------------------------------------------------------------

    def create_worktree(self, issue_num: int) -> str:
        branch = f"swarm/issue-{issue_num}"
        path = str(WORKTREES_DIR / str(issue_num))

        if Path(path).exists():
            shutil.rmtree(path)

        # Remove the branch if it already exists
        subprocess.run(
            ["git", "branch", "-D", branch],
            cwd=self.repo_root, capture_output=True,
        )

        subprocess.run(
            ["git", "worktree", "add", "-b", branch, path, self.base_sha],
            cwd=self.repo_root, capture_output=True, text=True, check=True,
        )

        # Copy api/.env so agents can run pytest and `alembic revision --autogenerate`
        src_env = self.repo_root / "api" / ".env"
        dst_env = Path(path) / "api" / ".env"
        if src_env.exists():
            shutil.copy2(src_env, dst_env)
        else:
            print(f"  [#{issue_num}] WARNING: api/.env not found — agents cannot run pytest or alembic")

        return path

    def remove_worktree(self, worktree_path: str) -> None:
        subprocess.run(
            ["git", "worktree", "remove", "--force", worktree_path],
            cwd=self.repo_root, capture_output=True,
        )

    # ------------------------------------------------------------------
    # CI annotation
    # ------------------------------------------------------------------

    def annotate_ci(self) -> None:
        """Post a CI-failure + review reminder comment on every open swarm PR."""
        r = subprocess.run(
            ["gh", "pr", "list",
             "--base", "v0.2",
             "--json", "number,url,headRefName,title",
             "--limit", "100"],
            cwd=self.repo_root, capture_output=True, text=True, check=True,
        )
        prs = [
            p for p in json.loads(r.stdout)
            if p["headRefName"].startswith("swarm/issue-")
        ]

        if not prs:
            print("[swarm] No open swarm PRs found.")
            return

        print(f"[swarm] Annotating {len(prs)} swarm PR(s)...")

        body = (
            "## ⚠️ Swarm Coordinator — Action Required\n\n"
            "**CI status:** Web lint (`npm run lint`) and API lint (`ruff check`) "
            "are currently failing on this PR. The swarm coordinator generated this "
            "implementation automatically and CI fixes will be needed before merge.\n\n"
            "**Recommended next steps:**\n"
            "1. Run `/review` in Claude Code for a full code review of this PR\n"
            "2. Fix lint/type errors:\n"
            "   ```bash\n"
            "   # API\n"
            "   cd api && ruff check . --fix && ruff format .\n"
            "   # Web\n"
            "   cd web && npm run lint\n"
            "   ```\n"
            "3. Run the test suite: `cd api && pytest`\n\n"
            "**To resume swarm implementation of the remaining issues:**\n"
            "```bash\n"
            "rm .swarm/KILL\n"
            "python scripts/swarm.py\n"
            "```\n\n"
            f"_Annotated by swarm coordinator at "
            f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_"
        )

        for pr in prs:
            result = subprocess.run(
                ["gh", "pr", "comment", str(pr["number"]), "--body", body],
                cwd=self.repo_root, capture_output=True, text=True,
            )
            if result.returncode == 0:
                print(f"  ✓ #{pr['number']}: {pr['title'][:55]}")
            else:
                print(f"  ✗ #{pr['number']}: {result.stderr.strip()[:80]}")

    def review_all(self) -> None:
        """Run /review on every open swarm PR (call after all issues are done)."""
        r = subprocess.run(
            ["gh", "pr", "list",
             "--base", "v0.2",
             "--json", "number,url,headRefName,title",
             "--limit", "100"],
            cwd=self.repo_root, capture_output=True, text=True, check=True,
        )
        prs = [
            p for p in json.loads(r.stdout)
            if p["headRefName"].startswith("swarm/issue-")
        ]

        if not prs:
            print("[swarm] No open swarm PRs found.")
            return

        print(f"[swarm] Running /review on {len(prs)} swarm PR(s) sequentially...")

        for pr in prs:
            if self.is_killed():
                print("[swarm] Kill switch — stopping reviews.")
                break

            print(f"\n  Reviewing PR #{pr['number']}: {pr['title'][:60]}")
            log_path = LOGS_DIR / f"review-{pr['number']}.log"

            with open(log_path, "w") as log_fh:
                proc = subprocess.run(
                    ["claude", "-p", f"/review {pr['number']}",
                     "--dangerously-skip-permissions",
                     "--model", SONNET,
                     "--no-session-persistence"],
                    cwd=self.repo_root,
                    stdout=log_fh, stderr=log_fh,
                    timeout=600,
                )

            status = "✓" if proc.returncode == 0 else "✗"
            print(f"  {status} PR #{pr['number']} reviewed — log: {log_path}")

    def cleanup_all(self, results: list[AgentResult]) -> None:
        print("\n[swarm] Cleaning up worktrees...")
        for r in results:
            if r.worktree_path and r.worktree_path != "(dry-run)":
                self.remove_worktree(r.worktree_path)
        subprocess.run(
            ["git", "worktree", "prune"], cwd=self.repo_root, capture_output=True
        )
        print("[swarm] Worktrees pruned.")

    # ------------------------------------------------------------------
    # Agent dispatch
    # ------------------------------------------------------------------

    def dispatch_agent(
        self, footprint: IssueFootprint, worktree_path: str
    ) -> AgentResult:
        if self.is_killed():
            return AgentResult(
                issue=footprint.number,
                branch=f"swarm/issue-{footprint.number}",
                worktree_path=worktree_path,
                status="killed",
            )

        result = AgentResult(
            issue=footprint.number,
            branch=f"swarm/issue-{footprint.number}",
            worktree_path=worktree_path,
            status="running",
            started_at=datetime.now(timezone.utc).isoformat(),
        )
        self.state.update_agent(footprint.number, asdict(result))

        log_path = LOGS_DIR / f"agent-{footprint.number}.log"
        prompt = self._build_agent_prompt(footprint, worktree_path)

        try:
            with open(log_path, "w") as log_fh:
                proc = subprocess.run(
                    [
                        "claude", "-p", prompt,
                        "--dangerously-skip-permissions",
                        "--model", footprint.model,
                        "--no-session-persistence",
                    ],
                    cwd=worktree_path,
                    stdout=log_fh,
                    stderr=log_fh,
                    timeout=AGENT_TIMEOUT,
                    text=True,
                )

            log_text = log_path.read_text(errors="replace")

            # Detect PR URL from log output
            pr_match = re.search(
                r"https://github\.com/[^\s]+/pull/\d+", log_text
            )
            result.pr_url = pr_match.group(0) if pr_match else None

            # Detect PR via gh if not found in log
            if not result.pr_url:
                pr_r = subprocess.run(
                    ["gh", "pr", "list",
                     "--head", result.branch,
                     "--json", "url", "--limit", "1"],
                    cwd=worktree_path, capture_output=True, text=True,
                )
                if pr_r.returncode == 0:
                    prs = json.loads(pr_r.stdout)
                    if prs:
                        result.pr_url = prs[0]["url"]

            # Heuristic: tests passed if log mentions "passed" without "failed"
            lower_log = log_text.lower()
            result.test_passed = (
                "passed" in lower_log and "failed" not in lower_log
            )
            result.status = "done" if result.pr_url else "failed"
            if proc.returncode != 0 and not result.pr_url:
                result.status = "failed"
                result.error = f"claude exited {proc.returncode}"

        except subprocess.TimeoutExpired:
            result.status = "failed"
            result.error = f"Timeout after {AGENT_TIMEOUT}s"
        except Exception as exc:  # noqa: BLE001
            result.status = "failed"
            result.error = str(exc)

        result.finished_at = datetime.now(timezone.utc).isoformat()
        self.state.update_agent(footprint.number, asdict(result))
        return result

    def _build_agent_prompt(
        self, footprint: IssueFootprint, worktree_path: str
    ) -> str:
        return f"""You are implementing GitHub issue #{footprint.number} in an isolated git worktree.

Issue title: {footprint.title}

Issue body:
{footprint.body}

---
INSTRUCTIONS — follow these steps in order:

1. Read CLAUDE.md first for architectural context, current constraints, and the
   canonical schema. Pay attention to the "What's Not Built Yet" section.

2. Read the issue carefully. IMPORTANT: issue descriptions may reference outdated
   v0.1 terminology (e.g. "collections", "pages", "collection_id", "page_id").
   Always cross-check against the *current* codebase before implementing:
     - api/marrow/models.py        — ORM schema
     - api/marrow/schemas.py       — Pydantic request/response shapes
     - web/lib/types.ts            — Frontend types
   The current schema is: organizations → workspaces → spaces → nodes
   (self-referential tree; type ∈ {{folder, page}}). There are no "collections".

3. Explore at least 3 related source files to understand existing patterns before
   writing any code. Match the style of surrounding code exactly.

4. Implement all required changes.
   - When writing marketing copy, only describe features that *actually exist* in
     the codebase. Never invent features (e.g. offline sync, AI, collaboration).
   - If the issue is a parent epic with no direct implementable scope of its own,
     write a brief explanation to stdout and stop — do not fabricate changes.

5. If your changes include an Alembic database migration:
   a. Run `cd api && alembic revision --autogenerate -m "<short description>"` to
      generate a real migration file with a real revision ID. NEVER write a fake
      or placeholder revision ID — it will cause `alembic upgrade head` to fail.
   b. Review the generated file in api/alembic/versions/ for correctness.
   c. Run `cd api && alembic upgrade head` to verify it applies cleanly.

6. If your changes touch api/marrow/export.py, ALWAYS check api/marrow/restore.py
   for the symmetric update and apply it. Export and restore must stay in sync —
   this is a non-negotiable project constraint (the "restore guarantee").

7. Run the full test suite and fix any failures before committing:
       cd api && python -m pytest -x -q 2>&1 | tail -30

8. Stage only source files — NEVER use `git add -A` or `git add .`:
       git add api/marrow/ api/tests/ api/alembic/ web/app/ web/components/ web/lib/ web/hooks/ docs/ CLAUDE.md
   Never stage build artifacts: dist/, .next/, node_modules/, *.pyc, *.egg-info/,
   next-env.d.ts, tsconfig.tsbuildinfo, or anything matched by .gitignore.
   Then commit:
       git commit -m "feat: implement #{footprint.number} — {footprint.title[:60]}"

9. Update CLAUDE.md if your changes add new routes, schema changes, new env vars,
   new components, or architectural decisions that future agents need to know.

10. Open a pull request targeting v0.2 (NOT main):
        gh pr create \\
          --base v0.2 \\
          --title "feat: #{footprint.number} {footprint.title}" \\
          --body "Closes #{footprint.number}.\\n\\n_Created by swarm coordinator_"

CONSTRAINTS:
- PR base branch MUST be v0.2. Never target main.
- Current worktree branch: swarm/issue-{footprint.number}
- Current worktree path: {worktree_path}
"""

    # ------------------------------------------------------------------
    # Dashboard
    # ------------------------------------------------------------------

    def print_dashboard(
        self,
        footprints: list[IssueFootprint],
        graph: dict[int, set[int]],
        batches: list[list[IssueFootprint]],
        results: list[AgentResult],
    ) -> None:
        width = 72
        bar = "=" * width
        print(f"\n{bar}")
        print("SWARM COORDINATOR DASHBOARD")
        print(f"Base SHA : {self.base_sha[:12]} (v0.2)")
        print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
        print(bar)

        # Conflict graph
        print(f"\nConflict graph ({len(graph)} issues):")
        for num in sorted(graph):
            confl = sorted(graph[num])
            tag = ", ".join(f"#{c}" for c in confl) if confl else "none"
            print(f"  #{num} ↔ {tag}")

        # Batch plan
        print(f"\nBatch plan ({len(batches)} batch{'es' if len(batches) != 1 else ''}):")
        for i, batch in enumerate(batches):
            nums = ", ".join(f"#{fp.number}" for fp in batch)
            print(f"  Batch {i + 1}: [{nums}]  ← parallel")

        # Per-agent results
        if results:
            print(f"\nAgent results:")
            hdr = f"  {'Issue':<8} {'Status':<10} {'Model':<22} {'Tests':<7} PR"
            print(hdr)
            print(f"  {'-'*8} {'-'*10} {'-'*22} {'-'*7} {'-'*42}")
            fp_by_num = {fp.number: fp for fp in footprints}
            result_by_num = {r.issue: r for r in results}
            for batch in batches:
                for fp in batch:
                    r = result_by_num.get(fp.number)
                    if not r:
                        continue
                    icon = "✓" if r.status == "done" else ("⚡" if r.status == "running" else ("·" if r.status == "dry-run" else "✗"))
                    test_icon = "✓" if r.test_passed else ("—" if r.status in ("dry-run", "killed") else "✗")
                    short_model = fp_by_num[fp.number].model.replace("claude-", "").replace("-20251001", "")
                    pr = r.pr_url or ("(dry-run)" if r.status == "dry-run" else "—")
                    print(
                        f"  #{fp.number:<7} {icon} {r.status:<9} {short_model:<22} {test_icon:<7} {pr}"
                    )
        else:
            print("\n  (no agents dispatched yet)")

        # Summary
        done = sum(1 for r in results if r.status == "done")
        failed = sum(1 for r in results if r.status == "failed")
        killed = sum(1 for r in results if r.status == "killed")
        dry = sum(1 for r in results if r.status == "dry-run")
        print(
            f"\nSummary: {done} done, {failed} failed, {killed} killed, {dry} dry-run"
            f" / {len(results)} total"
        )
        print(f"\nKill switch : touch {KILL_FILE}")
        print(f"State file  : {STATE_FILE}")
        print(f"Logs        : {LOGS_DIR}/")
        print(bar)

    # ------------------------------------------------------------------
    # Main run loop
    # ------------------------------------------------------------------

    def run(
        self,
        issue_numbers: Optional[list[int]] = None,
        cleanup: bool = True,
    ) -> list[AgentResult]:
        print(f"[swarm] Base SHA: {self.base_sha[:12]} (v0.2)")
        if self.dry_run:
            print("[swarm] DRY RUN — no worktrees or agents will be created\n")

        print("[swarm] Fetching issues...")
        issues = self.fetch_issues(issue_numbers)
        if not issues:
            print("[swarm] No issues found. Exiting.")
            return []
        print(f"[swarm] {len(issues)} issue(s): {[i['number'] for i in issues]}")

        print("[swarm] Analyzing file footprints (haiku)...")
        footprints: list[IssueFootprint] = []
        for issue in issues:
            fp = self.analyze_footprint(issue)
            footprints.append(fp)
            print(
                f"  #{fp.number}: {len(fp.files)} file(s), "
                f"~{fp.estimated_lines} lines → {fp.model.replace('claude-', '').replace('-20251001', '')}"
            )

        print("\n[swarm] Building conflict graph...")
        graph = self.build_conflict_graph(footprints)
        for num, conflicts in graph.items():
            if conflicts:
                print(f"  #{num} conflicts with {sorted(conflicts)}")
        if not any(graph.values()):
            print("  No conflicts — all issues can run in parallel.")

        print("\n[swarm] Partitioning into batches...")
        batches = self.partition_batches(footprints, graph)
        for i, batch in enumerate(batches):
            print(f"  Batch {i + 1}: {[fp.number for fp in batch]}")

        # Initialize state file
        self.state.write({
            "base_sha": self.base_sha,
            "dry_run": self.dry_run,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "batches": [[fp.number for fp in batch] for batch in batches],
            "agents": {str(fp.number): {"status": "pending"} for fp in footprints},
        })

        all_results: list[AgentResult] = []

        for batch_idx, batch in enumerate(batches):
            if self.is_killed():
                print(f"\n[swarm] Kill switch active — stopping before batch {batch_idx + 1}.")
                break

            label = f"Batch {batch_idx + 1}/{len(batches)}"
            nums = [fp.number for fp in batch]
            print(f"\n[swarm] {label}: issues {nums}")

            if self.dry_run:
                for fp in batch:
                    r = AgentResult(
                        issue=fp.number,
                        branch=f"swarm/issue-{fp.number}",
                        worktree_path="(dry-run)",
                        status="dry-run",
                    )
                    all_results.append(r)
                    self.state.update_agent(fp.number, asdict(r))
                print(f"  [dry-run] Would dispatch {len(batch)} agent(s) in parallel.")
                continue

            # Create worktrees for each issue in this batch
            worktrees: dict[int, str] = {}
            for fp in batch:
                if self.is_killed():
                    break
                try:
                    wt = self.create_worktree(fp.number)
                    worktrees[fp.number] = wt
                    print(f"  [#{fp.number}] Worktree: {wt}")
                except subprocess.CalledProcessError as exc:
                    print(f"  [#{fp.number}] ERROR creating worktree: {exc}")

            if not worktrees:
                continue

            # Dispatch agents in parallel for this batch
            with ThreadPoolExecutor(max_workers=len(worktrees)) as executor:
                futures = {
                    executor.submit(self.dispatch_agent, fp, worktrees[fp.number]): fp
                    for fp in batch
                    if fp.number in worktrees
                }
                for future in as_completed(futures):
                    fp = futures[future]
                    try:
                        r = future.result()
                    except Exception as exc:  # noqa: BLE001
                        r = AgentResult(
                            issue=fp.number,
                            branch=f"swarm/issue-{fp.number}",
                            worktree_path=worktrees.get(fp.number, ""),
                            status="failed",
                            error=str(exc),
                        )
                        self.state.update_agent(fp.number, asdict(r))

                    all_results.append(r)
                    icon = "✓" if r.status == "done" else "✗"
                    print(
                        f"  [#{fp.number}] {icon} {r.status}"
                        + (f" — PR: {r.pr_url}" if r.pr_url else "")
                        + (f" — ERROR: {r.error}" if r.error else "")
                    )

            self.print_dashboard(footprints, graph, batches, all_results)

        # Final dashboard (covers dry-run mode and the last real batch)
        if self.dry_run or (batches and not self.is_killed()):
            self.print_dashboard(footprints, graph, batches, all_results)

        if cleanup and not self.dry_run:
            self.cleanup_all(all_results)

        # Remind about review-all if all batches completed without kill
        if not self.is_killed() and not self.dry_run and all_results:
            pending_count = sum(
                1 for a in self.state.read().get("agents", {}).values()
                if a.get("status") == "pending"
            )
            if pending_count == 0:
                print(
                    "\n[swarm] All issues implemented. Run reviews:\n"
                    "  python scripts/swarm.py review-all\n"
                )

        return all_results


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Parallel worktree swarm coordinator for Marrow.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    subparsers = parser.add_subparsers(dest="command")

    # --- annotate subcommand ---
    subparsers.add_parser(
        "annotate",
        help="Post a CI-failure + review reminder comment on all open swarm PRs.",
    )

    # --- review-all subcommand ---
    subparsers.add_parser(
        "review-all",
        help="Run /review on every open swarm PR (run after all issues are implemented).",
    )

    # --- run subcommand (default) ---
    run_parser = subparsers.add_parser("run", help="Run the coordinator (default).")
    run_parser.add_argument(
        "--issues",
        type=str,
        default=None,
        metavar="N,N,...",
        help="Comma-separated issue numbers. Omit to auto-select from v0.2 milestone.",
    )
    run_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Analyze footprints and print the plan without creating worktrees or agents.",
    )
    run_parser.add_argument(
        "--no-cleanup",
        action="store_true",
        help="Keep worktrees after completion (useful for debugging agent output).",
    )

    # Support legacy top-level flags (no subcommand) for backwards compat
    parser.add_argument("--issues", type=str, default=None, metavar="N,N,...")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-cleanup", action="store_true")

    args = parser.parse_args()

    coordinator = SwarmCoordinator(REPO_ROOT, dry_run=getattr(args, "dry_run", False))

    if args.command == "annotate":
        coordinator.annotate_ci()
        sys.exit(0)

    if args.command == "review-all":
        coordinator.review_all()
        sys.exit(0)

    # Default: run
    issue_numbers: Optional[list[int]] = None
    issues_raw = getattr(args, "issues", None)
    if issues_raw:
        issue_numbers = [int(n.strip()) for n in issues_raw.split(",") if n.strip()]

    results = coordinator.run(issue_numbers, cleanup=not getattr(args, "no_cleanup", False))
    failed = [r for r in results if r.status == "failed"]
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
