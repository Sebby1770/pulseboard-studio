import unittest

from pulseboard import ProjectInputError, analyse_project


class EngineTests(unittest.TestCase):
    def test_scores_useful_project(self):
        result = analyse_project(
            {
                "idea": "Build an API dashboard that tracks customer usage data and launch risks.",
                "goal": "Ship a prototype for one SaaS workflow.",
                "deadlineDays": 21,
                "hoursPerWeek": 8,
                "confidence": 4,
                "scope": "focused",
                "riskAppetite": "medium",
            }
        )

        self.assertGreaterEqual(result["score"], 50)
        self.assertIn("feasibility", result["metrics"])
        self.assertTrue(result["nextSteps"])
        self.assertIn("api", result["signals"])

    def test_empty_idea_is_rejected(self):
        with self.assertRaises(ProjectInputError):
            analyse_project({"idea": "   "})

    def test_invalid_numbers_are_clamped(self):
        result = analyse_project(
            {
                "idea": "Automate weekly support notes.",
                "deadlineDays": -5,
                "hoursPerWeek": 500,
                "confidence": 99,
            }
        )

        self.assertLessEqual(result["score"], 100)
        self.assertGreaterEqual(result["metrics"]["risk"], 0)


if __name__ == "__main__":
    unittest.main()
