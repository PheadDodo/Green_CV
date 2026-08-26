import { describe, expect, it } from "vitest";

import { evaluationCvLabel } from "./evaluation-history";

describe("evaluationCvLabel", () => {
  it("does not relabel an evaluation with a newly attached CV after deletion", () => {
    expect(evaluationCvLabel(null, [{ id: "new-cv", name: "New CV" }]))
      .toBe("deleted CV version");
  });

  it("labels preserved evaluations with the CV version they actually used", () => {
    expect(evaluationCvLabel("old-cv", [
      { id: "new-cv", name: "New CV" },
      { id: "old-cv", name: "Original CV" },
    ])).toBe("Original CV");
  });
});
