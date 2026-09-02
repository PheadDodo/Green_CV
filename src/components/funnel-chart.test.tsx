// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FunnelChart } from "./funnel-chart";

afterEach(cleanup);

describe("FunnelChart", () => {
  it("describes each funnel stage and count to assistive technology", () => {
    render(<FunnelChart data={[
      { stage: "Discovered", value: 8 },
      { stage: "Applied", value: 5 },
      { stage: "Responded", value: 3 },
      { stage: "Interview", value: 2 },
      { stage: "Offer", value: 1 },
    ]} />);

    expect(screen.getByRole("img", {
      name: /application funnel chart.*Applied: 5.*Interview: 2.*Offer: 1/i,
    })).toBeTruthy();
  });
});
