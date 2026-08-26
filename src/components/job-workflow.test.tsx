// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JobWorkflow } from "./job-workflow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

describe("JobWorkflow", () => {
  it("uses the selected CV when an application has no CV attached", () => {
    render(<JobWorkflow
      applicationId="application-1"
      currentCvId={null}
      cvs={[
        { id: "cv-1", name: "General CV", isDefault: false },
        { id: "cv-2", name: "ML CV", isDefault: true },
      ]}
      hasEvaluation={false}
    />);

    expect((screen.getByLabelText("CV version") as HTMLSelectElement).value).toBe("cv-2");
  });
});
