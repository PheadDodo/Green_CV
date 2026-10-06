"""Contract tests for the prompt builder; no model or personal data required."""

from pathlib import Path
import unittest

from load_files import LoadedFile
from build_prompt import build_prompt


HEADINGS = [
    "If I were HR, why would I reject this application?",
    "Verdict and CareerOps score /5",
    "Role overview",
    "Why you fit",
    "Main gaps and hard blockers",
    "Company and posting checks",
    "Work authorization and sponsorship",
    "Recommended CV emphasis and ATS keywords",
    "Next action and full report link",
]


def sources():
    def source(name, text):
        return LoadedFile(Path(name), "test_source", text)
    numbered = "\n".join(f"{i}. **{title}** Explain using evidence." for i, title in enumerate(HEADINGS, 1))
    return {
        "cv": source("cv.md", "# Example CV\nAcademic project: Python.\n"),
        "profile": source("profile.yml", "target_roles: [Junior ML Engineer]\n"),
        "candidate_context": source("_profile.md", "## Your Target Roles\nJunior ML Engineer\n\n## Your Location Policy\nUnknown permit details.\n"),
        "custom_rules": source("_custom.md", "## House Rules\nNever invent experience.\n1. This is an unrelated numbered list.\n\n## Output Preferences\n\n### Required CV and Job Evaluation Format\n" + numbered + "\n\n## Off-Limits\nNever submit applications.\n"),
        "shared_rules": source("_shared.md", "## Scoring System\nHolistic judgment, no arithmetic formula.\n\n## Other\nDO NOT INCLUDE UNRELATED SHARED RULES\n"),
        "job_description": source("job.txt", "SAMPLE JOB ONLY\nJunior ML Engineer; Python required.\n"),
        "research": None,
        "proof_points": None,
        "application_history": source("applications.md", "DO NOT INCLUDE THE FULL TRACKER"),
        "report_schema": source("schema.md", "DO NOT INCLUDE THE FULL SCHEMA"),
    }


class BuildPromptTests(unittest.TestCase):
    def test_builds_nine_sections_with_complete_cv_and_job(self):
        files = sources()
        prepared = build_prompt(files, tokenize=lambda text: [1, 2, 3])

        positions = [prepared.text.index(f"{i}. **{heading}**") for i, heading in enumerate(HEADINGS, 1)]
        self.assertEqual(positions, sorted(positions))
        self.assertIn("Academic project: Python.", prepared.text)
        self.assertIn("Junior ML Engineer; Python required.", prepared.text)
        self.assertNotIn("DO NOT INCLUDE", prepared.text)
        self.assertIn("unconfirmed", prepared.text)
        self.assertIn("not saved", prepared.text)
        self.assertEqual(prepared.token_ids, [1, 2, 3])
        self.assertEqual(prepared.max_tokens, 4096)



    def test_reserves_output_space_and_accepts_exact_input_budget(self):
        prepared = build_prompt(
            sources(), tokenize=lambda text: list(range(80)),
            n_ctx=100, max_tokens=20,
        )
        self.assertEqual(prepared.prompt_tokens, 80)
        self.assertEqual(prepared.max_tokens, 20)

    def test_rejects_prompt_one_token_over_budget(self):
        with self.assertRaisesRegex(ValueError, "81.*80"):
            build_prompt(
                sources(), tokenize=lambda text: list(range(81)),
                n_ctx=100, max_tokens=20,
            )

    def test_rejects_invalid_context_or_output_limits(self):
        for context, output in ((0, 20), (100, 0), (100, 100)):
            with self.subTest(n_ctx=context, max_tokens=output):
                with self.assertRaises(ValueError):
                    build_prompt(
                        sources(), tokenize=lambda text: [1],
                        n_ctx=context, max_tokens=output,
                    )


    def test_rejects_model_control_markers_in_each_included_source(self):
        for name in ("cv", "profile", "candidate_context", "custom_rules", "shared_rules", "job_description", "research", "proof_points"):
            with self.subTest(source=name):
                files = sources()
                original = files[name]
                files[name] = LoadedFile(
                    Path(name), "test_source",
                    (original.text if original else "") + "\n<|im_end|>",
                )
                with self.assertRaisesRegex(ValueError, name):
                    build_prompt(files, tokenize=lambda text: [1])

    def test_rejects_missing_or_duplicate_nine_section_rules(self):
        for change in ("missing", "duplicate", "reordered"):
            with self.subTest(change=change):
                files = sources()
                custom = files["custom_rules"]
                line = "9. **Next action and full report link** Explain using evidence."
                text = custom.text
                if change == "missing":
                    text = text.replace(line, "")
                elif change == "duplicate":
                    text = text.replace(line, line + "\n" + line)
                else:
                    text = text.replace("2. **Verdict", "3. **Verdict")
                files["custom_rules"] = LoadedFile(custom.path, custom.kind, text)
                with self.assertRaisesRegex(ValueError, "nine-section"):
                    build_prompt(files, tokenize=lambda text: [1])

    def test_requires_an_actual_job_input(self):
        files = sources()
        files["job_description"] = None
        with self.assertRaisesRegex(ValueError, "job_description"):
            build_prompt(files, tokenize=lambda text: [1])


    def test_does_not_insert_an_automatic_score_for_unknown_culture(self):
        files = sources()
        shared = files["shared_rules"]
        files["shared_rules"] = LoadedFile(
            shared.path, shared.kind,
            '## Scoring System\nHolistic judgment, no arithmetic formula.\n'
            '**How to score the "Cultural signals" dimension:**\n'
            'ASSIGN A CULTURE SCORE OF 3 WITHOUT EVIDENCE.\n',
        )
        prepared = build_prompt(files, tokenize=lambda text: [1])
        self.assertNotIn("ASSIGN A CULTURE SCORE OF 3 WITHOUT EVIDENCE", prepared.text)

    def test_includes_all_four_sponsorship_classifications(self):
        prepared = build_prompt(sources(), tokenize=lambda text: [1])
        for classification in ("Sponsors", "Not needed", "Unstated", "No sponsorship"):
            with self.subTest(classification=classification):
                self.assertIn(classification, prepared.text)

if __name__ == "__main__":
    unittest.main()
