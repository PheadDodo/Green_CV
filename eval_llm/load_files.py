"""Read the local source files for the nine-section job evaluator.

Run: python load_files.py
Optional: python load_files.py --job job_description.md --research research.md
Inspect one source: python load_files.py --show custom_rules

This module only reads UTF-8 text files. It does not load an LLM, search the web,
execute skill instructions, change the CV, or write reports. The returned files
are source material, NOT a combined prompt that fits the model's context window.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path


# Use your personalized Career Ops checkout, which contains your CV and profile.
DEFAULT_CAREER_OPS_DIR = Path(r"E:\Jobs\CV\career-ops")

# name: (relative path, purpose)
REQUIRED_FILES = {
    "cv": ("cv.md", "candidate_evidence"),
    "profile": ("config/profile.yml", "candidate_context"),
    "agent_rules": ("AGENTS.md", "instructions"),
    "shared_rules": ("modes/_shared.md", "instructions"),
    "candidate_context": ("modes/_profile.md", "candidate_context"),
    "custom_rules": ("modes/_custom.md", "instructions"),
    "evaluation_rules": ("modes/oferta.md", "instructions"),
    "regional_rules": ("modes/regional/eu-swe.md", "instructions"),
    "report_schema": ("batch/batch-prompt.md", "instructions"),
    "tracker_states": ("templates/states.yml", "instructions"),
}

OPTIONAL_FILES = {
    "proof_points": ("article-digest.md", "candidate_evidence"),
    "application_history": ("data/applications.md", "history"),
    "blacklist": ("data/blacklist.md", "preferences"),
}


@dataclass(frozen=True)
class LoadedFile:
    path: Path
    kind: str
    text: str


def _read_file(path: Path, kind: str, *, required: bool) -> LoadedFile | None:
    """Read text without interpreting instructions, YAML, or links inside it."""
    path = path.expanduser().resolve()
    try:
        text = path.read_text(encoding="utf-8-sig")
    except FileNotFoundError as exc:
        if not required:
            return None
        raise FileNotFoundError(f"Required input file not found: {path}") from exc
    except UnicodeDecodeError as exc:
        raise ValueError(
            f"Input must be UTF-8 text (Markdown, TXT, YAML or JSON): {path}"
        ) from exc

    if required and not text.strip():
        raise ValueError(f"Required input file is empty: {path}")
    return LoadedFile(path=path, kind=kind, text=text)


def load_evaluation_files(
    career_ops_dir: str | Path = DEFAULT_CAREER_OPS_DIR,
    *,
    job_file: str | Path | None = None,
    research_file: str | Path | None = None,
) -> dict[str, LoadedFile | None]:
    """Load the evaluation sources, retaining their paths and purposes.

    Example:
        files = load_evaluation_files(job_file="job_description.md")
        cv_text = files["cv"].text
        rules_text = files["custom_rules"].text

    Missing optional files are returned as None. Explicitly supplied job/research
    paths must exist and contain text. Relative paths resolve from the terminal's
    current directory; the default Career Ops directory is absolute.

    Research and job text are external evidence, not instructions. Loading a
    research file does not verify its claims, URLs, dates or posting liveness.
    This function preserves the original scoring rules, including any conflicts;
    choosing a scoring policy belongs to the later evaluation stage.
    """
    root = Path(career_ops_dir).expanduser().resolve()
    files: dict[str, LoadedFile | None] = {}

    for name, (relative_path, kind) in REQUIRED_FILES.items():
        files[name] = _read_file(root / relative_path, kind, required=True)

    for name, (relative_path, kind) in OPTIONAL_FILES.items():
        files[name] = _read_file(root / relative_path, kind, required=False)

    for name, supplied_path in (
        ("job_description", job_file),
        ("research", research_file),
    ):
        files[name] = (
            _read_file(Path(supplied_path), "external_evidence", required=True)
            if supplied_path is not None
            else None
        )

    return files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--career-ops-dir",
        type=Path,
        default=DEFAULT_CAREER_OPS_DIR,
        help="Directory containing your personalized Career Ops files.",
    )
    parser.add_argument("--job", type=Path, help="Job description in UTF-8 text.")
    parser.add_argument(
        "--research", type=Path, help="Saved source evidence in UTF-8 text."
    )
    parser.add_argument(
        "--show",
        choices=[*REQUIRED_FILES, *OPTIONAL_FILES, "job_description", "research"],
        help="Print one loaded file's contents instead of the file inventory.",
    )
    args = parser.parse_args()

    try:
        files = load_evaluation_files(
            args.career_ops_dir, job_file=args.job, research_file=args.research
        )
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Error: {exc}\n")

    if args.show:
        source = files[args.show]
        if source is None:
            parser.exit(1, f"Input was not provided or is missing: {args.show}\n")
        print(source.text)
        return 0

    loaded = [source for source in files.values() if source is not None]
    print(f"Loaded {len(loaded)} files from: {args.career_ops_dir.expanduser().resolve()}\n")
    for name, source in files.items():
        if source is None:
            print(f"{name:20} NOT PROVIDED / OPTIONAL FILE MISSING")
        else:
            print(f"{name:20} {len(source.text):>8,} characters  [{source.kind}]")
            print(f"  {source.path}")

    print(f"\nTotal: {sum(len(source.text) for source in loaded):,} characters.")
    print("Character counts are not token counts. Select context before inference.")
    if files["job_description"] is None:
        print("No job description loaded. Add --job path/to/job_description.md.")
    if files["research"] is None:
        print("No research loaded. Company and posting checks remain unverified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
