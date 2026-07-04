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
                "evidence": "signals",
            }
        )

        self.assertGreaterEqual(result["score"], 50)
        self.assertIn("feasibility", result["metrics"])
        self.assertTrue(result["nextSteps"])
        self.assertIn("api", result["signals"])
        self.assertEqual(set(result["smallestExperiment"]), {"build", "test", "success"})
        self.assertGreaterEqual(len(result["questions"]), 3)
        self.assertEqual(result["modelVersion"], "7.0")
        self.assertEqual(result["metrics"]["evidence"], 60)
        self.assertEqual(set(result["scoreRange"]), {"low", "high", "margin"})
        self.assertEqual(
            set(result["recommendedLever"]),
            {"metric", "title", "action", "rationale"},
        )
        self.assertEqual(len(result["highestImpactMoves"]), 3)
        self.assertEqual(len(result["scenarioVariants"]), 3)
        self.assertEqual(len(result["thisWeekPlan"]["blocks"]), 4)
        self.assertEqual(len(result["stopConditions"]), 3)

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

    def test_validation_evidence_improves_score_and_reduces_risk(self):
        base = {
            "idea": "Build a focused dashboard for one customer workflow.",
            "goal": "Ship a measurable prototype.",
            "deadlineDays": 30,
            "hoursPerWeek": 8,
            "confidence": 4,
            "scope": "focused",
        }

        idea_only = analyse_project({**base, "evidence": "idea"})
        user_proof = analyse_project({**base, "evidence": "users"})

        self.assertGreater(user_proof["score"], idea_only["score"])
        self.assertLess(user_proof["metrics"]["risk"], idea_only["metrics"]["risk"])
        self.assertEqual(user_proof["evidenceGrade"]["label"], "Evidence-backed")
        self.assertEqual(idea_only["scoreRange"]["margin"], 12)
        self.assertEqual(user_proof["scoreRange"]["margin"], 3)

    def test_risk_tolerance_does_not_change_objective_metrics(self):
        base = {
            "idea": "Build a focused API workflow.",
            "goal": "Ship one prototype.",
            "evidence": "signals",
        }

        cautious = analyse_project({**base, "riskAppetite": "low"})
        bold = analyse_project({**base, "riskAppetite": "high"})

        self.assertEqual(cautious["metrics"], bold["metrics"])
        self.assertGreater(bold["score"], cautious["score"])

    def test_extra_wording_stops_inflating_clarity_after_cap(self):
        short = analyse_project(
            {
                "idea": "planning " * 18,
                "goal": "Ship one clear result.",
            }
        )
        long = analyse_project(
            {
                "idea": "planning " * 100,
                "goal": "Ship one clear result.",
            }
        )

        self.assertEqual(short["metrics"]["clarity"], long["metrics"]["clarity"])

    def test_idea_only_projects_recommend_evidence_lever_when_other_metrics_are_strong(self):
        result = analyse_project(
            {
                "idea": "Build a focused API dashboard for one customer workflow.",
                "goal": "Ship a measurable prototype for one user.",
                "deadlineDays": 30,
                "hoursPerWeek": 10,
                "confidence": 5,
                "scope": "tiny",
                "evidence": "idea",
            }
        )

        self.assertEqual(result["recommendedLever"]["metric"], "Evidence")

    def test_impact_moves_are_ranked_by_real_projected_score_gain(self):
        result = analyse_project(
            {
                "idea": "Build an ambitious API dashboard and automation platform.",
                "goal": "Ship a complete platform for every customer workflow.",
                "deadlineDays": 14,
                "hoursPerWeek": 4,
                "confidence": 2,
                "scope": "ambitious",
                "evidence": "idea",
            }
        )

        moves = result["highestImpactMoves"]
        self.assertEqual([move["delta"] for move in moves], sorted(
            [move["delta"] for move in moves], reverse=True
        ))
        self.assertTrue(all(move["projectedScore"] == result["score"] + move["delta"] for move in moves))
        self.assertIn("evidence", {move["id"] for move in moves})

    def test_stop_conditions_reflect_early_evidence(self):
        result = analyse_project(
            {
                "idea": "Test a focused workflow for one user.",
                "evidence": "idea",
            }
        )

        self.assertIn("Do not expand scope", result["stopConditions"][0])

    def test_scenario_variants_show_upside_and_scope_drift(self):
        result = analyse_project(
            {
                "idea": "Build an ambitious API dashboard and automation platform.",
                "goal": "Ship a complete platform for every customer workflow.",
                "deadlineDays": 14,
                "hoursPerWeek": 4,
                "confidence": 2,
                "scope": "ambitious",
                "evidence": "idea",
            }
        )

        variants = {variant["id"]: variant for variant in result["scenarioVariants"]}
        self.assertGreater(variants["proof-sprint"]["score"], result["score"])
        self.assertLessEqual(variants["scope-drift"]["score"], result["score"])
        self.assertTrue(variants["lean-launch"]["changes"])

    def test_this_week_plan_uses_available_hours_and_domain_signals(self):
        result = analyse_project(
            {
                "idea": "Automate API support workflow data.",
                "goal": "Ship one reliable workflow.",
                "hoursPerWeek": 7,
                "evidence": "signals",
            }
        )

        plan = result["thisWeekPlan"]
        self.assertEqual(plan["availableHours"], 7)
        self.assertEqual(sum(block["hours"] for block in plan["blocks"]), 7)
        self.assertIn("automation", plan["blocks"][1]["action"])

    def test_this_week_plan_does_not_overallocate_tiny_hour_budgets(self):
        result = analyse_project(
            {
                "idea": "Build one tiny dashboard workflow.",
                "hoursPerWeek": 1,
            }
        )

        plan = result["thisWeekPlan"]
        self.assertEqual(plan["availableHours"], 1)
        self.assertEqual(sum(block["hours"] for block in plan["blocks"]), 1)
        self.assertEqual([block["hours"] for block in plan["blocks"]], [1, 0, 0, 0])


if __name__ == "__main__":
    unittest.main()
