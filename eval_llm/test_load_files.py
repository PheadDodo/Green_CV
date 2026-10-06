"""File-loading checks with synthetic CVs and real temporary files.

Run from eval_llm: python -B -m unittest test_load_files -v
No model, network, third-party packages, or personal CV data are needed.
"""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from load_files import load_evaluation_files


CV_TEXT = "# Example Candidate\n\n## Skills\n- Python\n- SQL\n"
JOB_TEXT = "Junior Data Scientist\nRequired: Python and SQL.\n"


class LoadFilesTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="eval-loader-test-")
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.career_ops = self.directory / "career ops"
        # An independent, synthetic Career Ops checkout. No real CV is copied.
        fixture_files = {
            "cv.md": CV_TEXT,
            "config/profile.yml": "candidate:\n  full_name: Example Candidate\n",
            "AGENTS.md": "# Workflow\nUse documented evidence only.\n",
            "modes/_shared.md": "# Shared rules\nMark unknown information.\n",
            "modes/_profile.md": "# Targets\nJunior data roles.\n",
            "modes/_custom.md": "# Output\nUse the required nine sections.\n",
            "modes/oferta.md": "# Evaluation\nCompare the CV with the job.\n",
            "modes/regional/eu-swe.md": "# Regional rules\nVerify sources.\n",
            "batch/batch-prompt.md": "# Report schema\nSave evidence references.\n",
            "templates/states.yml": "states:\n  - Evaluated\n",
        }
        for relative_path, text in fixture_files.items():
            path = self.career_ops / relative_path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")

    def test_reads_markdown_cv_and_markdown_job(self):
        job = self.directory / "job.md"
        job.write_text("# Job posting\n\n" + JOB_TEXT, encoding="utf-8")

        files = load_evaluation_files(self.career_ops, job_file=job)

        self.assertEqual(files["cv"].text, CV_TEXT)
        self.assertEqual(files["job_description"].text, "# Job posting\n\n" + JOB_TEXT)
        self.assertEqual(files["job_description"].kind, "external_evidence")

    def test_reads_plain_text_job_with_spaces_in_filename(self):
        job = self.directory / "junior data scientist.txt"
        job.write_text(JOB_TEXT, encoding="utf-8")

        files = load_evaluation_files(self.career_ops, job_file=job)

        self.assertEqual(files["job_description"].text, JOB_TEXT)
        self.assertEqual(files["job_description"].path, job.resolve())

    def test_preserves_unicode_and_removes_utf8_bom(self):
        job = self.directory / "unicode.txt"
        job.write_text("Location: Malmö\n要求：Python\n", encoding="utf-8-sig")

        files = load_evaluation_files(self.career_ops, job_file=job)

        self.assertEqual(files["job_description"].text, "Location: Malmö\n要求：Python\n")

    def test_json_and_yaml_are_returned_as_raw_text(self):
        for filename, text in (
            ("job.json", '{"title": "Junior ML Engineer"}\n'),
            ("job.yaml", "title: Junior ML Engineer\n"),
        ):
            with self.subTest(filename=filename):
                job = self.directory / filename
                job.write_text(text, encoding="utf-8")
                files = load_evaluation_files(self.career_ops, job_file=job)
                self.assertEqual(files["job_description"].text, text)

    def test_missing_job_reports_its_path(self):
        job = self.directory / "missing.txt"

        with self.assertRaises(FileNotFoundError) as error:
            load_evaluation_files(self.career_ops, job_file=job)

        self.assertIn(str(job), str(error.exception))

    def test_empty_job_is_rejected(self):
        job = self.directory / "empty.txt"
        job.write_text(" \n\t", encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "empty"):
            load_evaluation_files(self.career_ops, job_file=job)

    def test_non_utf8_text_reports_encoding_and_path(self):
        job = self.directory / "utf16.txt"
        job.write_text(JOB_TEXT, encoding="utf-16")

        with self.assertRaises(ValueError) as error:
            load_evaluation_files(self.career_ops, job_file=job)

        self.assertIn("UTF-8", str(error.exception))
        self.assertIn(str(job), str(error.exception))

    def test_cli_shows_txt_job_from_a_different_working_directory(self):
        job = self.directory / "job description.txt"
        job.write_text(JOB_TEXT, encoding="utf-8")
        script = Path(__file__).resolve().with_name("load_files.py")

        result = subprocess.run(
            [
                sys.executable, "-B", str(script),
                "--career-ops-dir", str(self.career_ops),
                "--job", job.name, "--show", "job_description",
            ],
            cwd=self.directory,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
            timeout=30,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, JOB_TEXT + "\n")


if __name__ == "__main__":
    unittest.main()
