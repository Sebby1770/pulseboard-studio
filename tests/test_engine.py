import unittest

from pulseboard import ProjectInputError, analyse_project, analyse_slate


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
        self.assertEqual(result["modelVersion"], "9.1")
        self.assertIn(result["goNoGo"]["decision"], {"GO", "CONDITIONAL", "NO-GO"})
        self.assertGreaterEqual(len(result["killCriteria"]), 2)
        self.assertGreaterEqual(len(result["sensitivityTable"]), 4)
        self.assertEqual(len(result["evidenceLadder"]), 3)
        self.assertTrue(any(rung["current"] for rung in result["evidenceLadder"]))
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

    def test_omitted_hours_default_to_eight(self):
        idea = "Build a focused API workflow for one customer."
        omitted = analyse_project({"idea": idea})
        explicit = analyse_project({"idea": idea, "hoursPerWeek": 8})

        self.assertEqual(omitted["score"], explicit["score"])
        self.assertEqual(omitted["thisWeekPlan"]["availableHours"], 8)
        self.assertIn("8 hours per week", omitted["summary"])

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

    def test_go_nogo_requires_evidence_for_a_full_go(self):
        idea_only = analyse_project(
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
        proven = analyse_project(
            {
                "idea": "Build a focused API dashboard for one customer workflow.",
                "goal": "Ship a measurable prototype for one user.",
                "deadlineDays": 30,
                "hoursPerWeek": 10,
                "confidence": 5,
                "scope": "tiny",
                "evidence": "users",
            }
        )
        weak = analyse_project(
            {
                "idea": "x",
                "deadlineDays": 1,
                "hoursPerWeek": 1,
                "confidence": 1,
                "scope": "ambitious",
                "evidence": "idea",
            }
        )

        self.assertEqual(idea_only["goNoGo"]["decision"], "CONDITIONAL")
        self.assertIn(proven["goNoGo"]["decision"], {"GO", "CONDITIONAL"})
        if proven["score"] >= 72:
            self.assertEqual(proven["goNoGo"]["decision"], "GO")
        self.assertEqual(weak["goNoGo"]["decision"], "NO-GO")
        self.assertIn("Kill this idea", idea_only["killCriteria"][0])

    def test_sensitivity_table_recomputes_real_score_deltas(self):
        result = analyse_project(
            {
                "idea": "Build a focused API dashboard for one customer workflow.",
                "goal": "Ship a measurable prototype.",
                "deadlineDays": 21,
                "hoursPerWeek": 8,
                "confidence": 4,
                "scope": "focused",
                "evidence": "signals",
            }
        )

        rows = result["sensitivityTable"]
        self.assertTrue(rows)
        self.assertTrue(all({"input", "direction", "from", "to", "score", "delta"} <= set(row) for row in rows))
        self.assertTrue(any(row["input"] == "scope" for row in rows))
        self.assertTrue(any(row["input"] == "evidence" for row in rows))
        self.assertTrue(
            all(row["score"] == result["score"] + row["delta"] for row in rows)
        )
        stronger = next(row for row in rows if row["input"] == "evidence" and row["direction"] == "stronger")
        self.assertGreater(stronger["delta"], 0)

    def test_evidence_ladder_marks_current_rung_and_improves_with_proof(self):
        result = analyse_project(
            {
                "idea": "Build a focused API dashboard for one customer workflow.",
                "goal": "Ship a measurable prototype.",
                "deadlineDays": 30,
                "hoursPerWeek": 8,
                "confidence": 4,
                "scope": "focused",
                "evidence": "idea",
            }
        )

        ladder = {rung["evidence"]: rung for rung in result["evidenceLadder"]}
        self.assertEqual(set(ladder), {"idea", "signals", "users"})
        self.assertTrue(ladder["idea"]["current"])
        self.assertFalse(ladder["users"]["current"])
        self.assertGreater(ladder["users"]["score"], ladder["idea"]["score"])
        self.assertEqual(ladder["idea"]["decision"], "CONDITIONAL")

    def test_flip_points_find_a_change_that_changes_the_call(self):
        result = analyse_project(
            {
                "idea": "Build a focused API dashboard for one customer workflow.",
                "goal": "Ship a measurable prototype for one user.",
                "deadlineDays": 30,
                "hoursPerWeek": 10,
                "confidence": 5,
                "scope": "tiny",
                "evidence": "users",
            }
        )

        self.assertEqual(result["goNoGo"]["decision"], "GO")

        points = result["flipPoints"]
        self.assertTrue(points)
        evidence_flip = next(point for point in points if point["input"] == "evidence")
        self.assertEqual(evidence_flip["from"], "users")
        self.assertEqual(evidence_flip["to"], "idea")
        self.assertEqual(evidence_flip["decision"], "CONDITIONAL")
        self.assertEqual(evidence_flip["currentDecision"], "GO")
        self.assertEqual(evidence_flip["score"], result["score"] + evidence_flip["delta"])


SAAS_BRIEF = {
    "idea": "Build an API dashboard that tracks customer usage data and launch risks.",
    "goal": "Ship a prototype for one SaaS workflow.",
    "deadlineDays": 21,
    "hoursPerWeek": 8,
    "confidence": 4,
    "scope": "focused",
    "riskAppetite": "medium",
    "evidence": "signals",
}

NO_GO_BRIEF = {
    "idea": "x",
    "deadlineDays": 1,
    "hoursPerWeek": 1,
    "confidence": 1,
    "scope": "ambitious",
    "evidence": "idea",
}

CONDITIONAL_BRIEF = {
    "idea": "Build a focused dashboard for one customer workflow.",
    "goal": "Ship a measurable prototype.",
    "deadlineDays": 30,
    "hoursPerWeek": 8,
    "confidence": 4,
    "scope": "focused",
    "evidence": "idea",
}


class Engine91Tests(unittest.TestCase):
    def test_default_brief_keeps_the_9_0_score_when_mutes_are_omitted(self):
        omitted = analyse_project(SAAS_BRIEF)
        explicit = analyse_project({**SAAS_BRIEF, "mutedSignals": []})
        ignored = analyse_project({**SAAS_BRIEF, "mutedSignals": "api"})
        unknown = analyse_project({**SAAS_BRIEF, "mutedSignals": ["revenue", "nope"]})

        for result in (omitted, explicit, ignored, unknown):
            self.assertEqual(result["score"], 75)
            self.assertEqual(result["verdict"], "Promising, trim scope")
            self.assertEqual(result["goNoGo"]["decision"], "GO")
            self.assertEqual(
                result["metrics"],
                {
                    "clarity": 89,
                    "feasibility": 72,
                    "momentum": 100,
                    "evidence": 60,
                    "risk": 58,
                },
            )
            self.assertEqual(result["modelVersion"], "9.1")

        self.assertEqual(omitted["score"], explicit["score"])
        self.assertEqual(omitted["metrics"], explicit["metrics"])
        self.assertEqual(omitted["verdict"], explicit["verdict"])
        self.assertEqual(omitted["goNoGo"]["decision"], explicit["goNoGo"]["decision"])

    def test_muting_a_present_signal_changes_the_score_and_records_it(self):
        brief = {
            "idea": "Ship one workflow.",
            "goal": "Finish one useful slice.",
        }
        baseline = analyse_project(brief)
        muted = analyse_project({**brief, "mutedSignals": ["ship", "not-a-signal"]})

        self.assertIn("ship", baseline["signals"])
        self.assertNotEqual(muted["score"], baseline["score"])
        self.assertLess(muted["score"], baseline["score"])
        self.assertNotIn("ship", muted["signals"])
        self.assertIn("workflow", muted["signals"])
        muted_rows = [row for row in muted["assumptions"] if row["source"] == "ship"]
        self.assertEqual(
            muted_rows,
            [
                {
                    "id": "signal_ship",
                    "label": "ship",
                    "metric": "clarity",
                    "direction": "muted",
                    "source": "ship",
                }
            ],
        )
        self.assertNotIn("signal_ship", [row["id"] for row in muted["assumptions"] if row["direction"] == "up"])

    def test_flat_baseline_inputs_are_omitted_from_assumptions(self):
        result = analyse_project(
            {
                "idea": "Organize metadata for a catalogue.",
                "goal": "Finish one useful slice.",
                "deadlineDays": 21,
                "hoursPerWeek": 8,
                "confidence": 3,
                "scope": "focused",
                "riskAppetite": "medium",
                "evidence": "idea",
            }
        )

        self.assertEqual(
            [row["id"] for row in result["assumptions"]],
            ["idea_words", "goal_words"],
        )
        self.assertTrue(all(row["direction"] == "up" for row in result["assumptions"]))

        shifted = analyse_project(
            {
                "idea": "Organize metadata for a catalogue.",
                "goal": "Finish one useful slice.",
                "deadlineDays": 7,
                "hoursPerWeek": 4,
                "confidence": 5,
                "scope": "tiny",
                "riskAppetite": "low",
                "evidence": "users",
            }
        )
        by_id = {row["id"]: row for row in shifted["assumptions"]}
        self.assertEqual(by_id["confidence"]["direction"], "up")
        self.assertEqual(by_id["confidence"]["metric"], "momentum")
        self.assertEqual(by_id["hours"]["direction"], "down")
        self.assertEqual(by_id["hours"]["metric"], "momentum")
        self.assertEqual(by_id["deadline"]["direction"], "down")
        self.assertEqual(by_id["deadline"]["metric"], "risk")
        self.assertEqual(by_id["scope"]["direction"], "up")
        self.assertEqual(by_id["scope"]["metric"], "feasibility")
        self.assertEqual(by_id["evidence"]["direction"], "up")
        self.assertEqual(by_id["evidence"]["metric"], "evidence")
        self.assertEqual(by_id["risk_appetite"]["direction"], "down")
        self.assertEqual(by_id["risk_appetite"]["metric"], "risk")
        self.assertNotIn("signal_data", by_id)

    def test_detected_signal_rows_stay_even_when_controls_are_flat(self):
        result = analyse_project(
            {
                "idea": "Ship one workflow.",
                "goal": "Finish one useful slice.",
            }
        )
        signal_rows = [row for row in result["assumptions"] if row["id"].startswith("signal_")]
        self.assertEqual([row["id"] for row in signal_rows], ["signal_ship", "signal_workflow"])
        self.assertTrue(all(row["direction"] == "up" for row in signal_rows))

    def test_one_go_and_one_no_go_assigns_the_pool_to_the_go(self):
        slate = analyse_slate({"hoursPerWeek": 8, "briefs": [NO_GO_BRIEF, SAAS_BRIEF]})

        self.assertEqual(slate["modelVersion"], "9.1")
        self.assertEqual(slate["hoursPerWeek"], 8)
        self.assertEqual(slate["totalAssigned"], 8)
        self.assertEqual([item["rank"] for item in slate["items"]], [1, 2])
        self.assertEqual(slate["items"][0]["label"], "do")
        self.assertEqual(slate["items"][0]["hours"], 8)
        self.assertEqual(slate["items"][0]["result"]["goNoGo"]["decision"], "GO")
        self.assertEqual(slate["items"][0]["result"]["score"], 75)
        self.assertEqual(slate["items"][1]["label"], "kill")
        self.assertEqual(slate["items"][1]["hours"], 0)
        self.assertEqual(slate["items"][1]["result"]["goNoGo"]["decision"], "NO-GO")

    def test_six_no_go_briefs_assign_nothing(self):
        slate = analyse_slate({"hoursPerWeek": 8, "briefs": [NO_GO_BRIEF] * 6})

        self.assertEqual(slate["totalAssigned"], 0)
        self.assertEqual(len(slate["items"]), 6)
        self.assertTrue(all(item["label"] == "kill" and item["hours"] == 0 for item in slate["items"]))
        self.assertEqual([item["rank"] for item in slate["items"]], [1, 2, 3, 4, 5, 6])

    def test_two_gos_with_one_hour_park_the_lower_go(self):
        higher = {**SAAS_BRIEF, "scope": "tiny"}
        slate = analyse_slate({"hoursPerWeek": 1, "briefs": [SAAS_BRIEF, higher]})

        self.assertGreater(slate["items"][0]["result"]["score"], slate["items"][1]["result"]["score"])
        self.assertEqual(slate["items"][0]["brief"]["scope"], "tiny")
        self.assertEqual(slate["items"][0]["label"], "do")
        self.assertEqual(slate["items"][0]["hours"], 1)
        self.assertEqual(slate["items"][0]["result"]["goNoGo"]["decision"], "GO")
        self.assertEqual(slate["items"][1]["label"], "park")
        self.assertEqual(slate["items"][1]["hours"], 0)
        self.assertEqual(slate["items"][1]["result"]["goNoGo"]["decision"], "GO")
        self.assertEqual(slate["totalAssigned"], 1)

    def test_all_conditional_assigns_the_full_pool_to_the_top_one(self):
        lower = {**CONDITIONAL_BRIEF, "confidence": 2}
        slate = analyse_slate({"hoursPerWeek": 6, "briefs": [lower, CONDITIONAL_BRIEF]})

        self.assertTrue(
            all(item["result"]["goNoGo"]["decision"] == "CONDITIONAL" for item in slate["items"])
        )
        self.assertEqual(slate["items"][0]["brief"]["confidence"], 4)
        self.assertEqual(slate["items"][0]["label"], "do")
        self.assertEqual(slate["items"][0]["hours"], 6)
        self.assertEqual(slate["items"][1]["label"], "park")
        self.assertEqual(slate["items"][1]["hours"], 0)
        self.assertEqual(slate["totalAssigned"], 6)

    def test_slate_rejects_empty_and_oversized_boards(self):
        with self.assertRaises(ProjectInputError):
            analyse_slate({"briefs": []})
        with self.assertRaises(ProjectInputError):
            analyse_slate({"briefs": [SAAS_BRIEF] * 7})
        with self.assertRaises(ProjectInputError):
            analyse_slate(["not", "an", "object"])


if __name__ == "__main__":
    unittest.main()
