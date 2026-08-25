import { describe, expect, it } from "vitest";
import { demoEvaluateRole, evaluationResultSchema } from "./evaluation";

describe("demoEvaluateRole", () => {
  it("only returns CV sentences as evidence and a schema-valid result", () => {
    const cv = "Built Python NLP services for customer-support classification. Reduced inference latency by 18% through batching. Worked with product and data teams.";
    const result = demoEvaluateRole({
      jobTitle: "Machine Learning Engineer",
      company: "Northstar",
      jobDescription: "Build Python NLP services in production.\nImprove inference latency and reliability.\nOperate Kubernetes clusters.",
      cvName: "ML CV",
      cvContent: cv
    });

    expect(() => evaluationResultSchema.parse(result)).not.toThrow();
    for (const match of [...result.strongMatches, ...result.partialMatches]) {
      expect(cv).toContain(match.evidence);
    }
    expect(result.gaps.some(gap => gap.requirement.includes("Kubernetes"))).toBe(true);
  });

  it("does not manufacture evidence when the CV is unrelated", () => {
    const result = demoEvaluateRole({
      jobTitle: "ML Engineer",
      company: "Northstar",
      jobDescription: "Operate Kubernetes clusters and deploy transformer models.",
      cvName: "CV",
      cvContent: "Managed retail schedules and improved store operations."
    });
    expect(result.strongMatches).toHaveLength(0);
    expect(result.partialMatches).toHaveLength(0);
    expect(result.recommendation).toBe("skip");
  });
});
