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
        self.assertEqual(set(result["smallestExperiment"]), {"build", "test", "success"})
        self.assertGreaterEqual(len(result["questions"]), 3)
        self.assertEqual(result["modelVersion"], "3.0")
        self.assertEqual(
            set(result["recommendedLever"]),
            {"metric", "title", "action", "rationale"},
        )

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

    def test_signal_detection_uses_whole_words(self):
        result = analyse_project({"idea": "Organize metadata for a catalogue."})

        self.assertNotIn("data", result["signals"])

    def test_every_result_has_a_risk_note(self):
        result = analyse_project(
            {
                "idea": "Ship a focused API prototype for one user workflow.",
                "deadlineDays": 30,
                "hoursPerWeek": 10,
                "confidence": 5,
                "scope": "tiny",
            }
        )

        self.assertTrue(result["risks"])

    def test_ambitious_scope_recommends_feasibility_lever(self):
        result = analyse_project(
            {
                "idea": "Build a platform with an API, dashboard, automation, and analytics.",
                "goal": "Launch the complete platform.",
                "deadlineDays": 21,
                "hoursPerWeek": 4,
                "confidence": 2,
                "scope": "ambitious",
            }
        )

        self.assertEqual(result["recommendedLever"]["metric"], "Feasibility")


if __name__ == "__main__":
    unittest.main()
