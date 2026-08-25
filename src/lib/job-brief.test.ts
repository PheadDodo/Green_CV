import { describe, expect, it } from "vitest";
import { summarizeJobDescription } from "./job-brief";

describe("summarizeJobDescription", () => {
  it("extracts structured sections without paraphrasing the posting", () => {
    const description = `
About the role
Join the platform group to improve how teams ship machine learning products.

Responsibilities
- Design Python services for model inference.
- Partner with data scientists to monitor production models.

Required qualifications
- 3+ years of experience with Python and SQL.
- You must be comfortable operating cloud services.

Preferred qualifications
- Kubernetes experience is preferred.

Location and compensation
- Hybrid in Berlin, Germany.
- €80,000–€95,000 plus equity.
`;

    expect(summarizeJobDescription(description)).toMatchObject({
      overview: ["Join the platform group to improve how teams ship machine learning products."],
      responsibilities: [
        "Design Python services for model inference.",
        "Partner with data scientists to monitor production models.",
      ],
      mustHaves: [
        "3+ years of experience with Python and SQL.",
        "You must be comfortable operating cloud services.",
      ],
      niceToHaves: ["Kubernetes experience is preferred."],
      logistics: ["Hybrid in Berlin, Germany.", "€80,000–€95,000 plus equity."],
    });
  });

  it("classifies explicit signals in an unstructured description", () => {
    const description = [
      "Help a small healthcare team launch its analytics platform.",
      "You will own data pipelines and dashboard delivery.",
      "At least 4 years of experience with SQL is required.",
      "Experience with dbt is a plus.",
      "This is a remote full-time role within Europe.",
    ].join("\n");

    const brief = summarizeJobDescription(description);

    expect(brief.overview).toEqual(["Help a small healthcare team launch its analytics platform."]);
    expect(brief.responsibilities).toEqual(["You will own data pipelines and dashboard delivery."]);
    expect(brief.mustHaves).toEqual(["At least 4 years of experience with SQL is required."]);
    expect(brief.niceToHaves).toEqual(["Experience with dbt is a plus."]);
    expect(brief.logistics).toEqual(["This is a remote full-time role within Europe."]);
  });

  it("returns only evidence copied from the preserved description", () => {
    const description = `Overview:\nBuild accessible React products.\nRequirements:\n- TypeScript is required.\n- WCAG knowledge preferred.\nLocation:\nRemote in the EU.`;
    const brief = summarizeJobDescription(description);
    const extracted = [
      ...brief.overview,
      ...brief.responsibilities,
      ...brief.mustHaves,
      ...brief.niceToHaves,
      ...brief.logistics,
      ...brief.keywords,
    ];

    expect(extracted.length).toBeGreaterThan(0);
    for (const value of extracted) expect(description).toContain(value);
  });

  it("does not add fallback claims to an empty posting", () => {
    expect(summarizeJobDescription("   \n")).toEqual({
      overview: [],
      responsibilities: [],
      mustHaves: [],
      niceToHaves: [],
      logistics: [],
      keywords: [],
    });
  });

  it("lets explicit headings override sentence-level action signals", () => {
    const brief = summarizeJobDescription(
      "Requirements\n- Build REST APIs\nPreferred qualifications\n- Design systems thinking",
    );
    expect(brief.mustHaves).toEqual(["Build REST APIs"]);
    expect(brief.niceToHaves).toEqual(["Design systems thinking"]);
    expect(brief.responsibilities).toEqual([]);
  });

  it("does not carry requirements into company or legal boilerplate", () => {
    const brief = summarizeJobDescription(
      "Requirements\nPython\nAbout us\nWe are an equal opportunity employer.",
    );
    expect(brief.mustHaves).toEqual(["Python"]);
    expect(brief.mustHaves.join(" ")).not.toMatch(/About us|equal opportunity/i);
  });

  it("keeps short and punctuated technology names as keywords", () => {
    const brief = summarizeJobDescription(
      "Requirements\nC++ and C# required.\nGo and R required.\n.NET and Node.js required.",
    );
    expect(brief.keywords).toEqual(
      expect.arrayContaining(["C++", "C#", "Go", "R", ".NET", "Node.js"]),
    );
    expect(brief.keywords).not.toEqual(
      expect.arrayContaining(["Requirements", "required"]),
    );
  });

  it("keeps nested requirement groups under their explicit section", () => {
    const brief = summarizeJobDescription(
      "Requirements\nExperience with:\n- Python\n- SQL\n- Kubernetes",
    );
    expect(brief.mustHaves).toEqual(["Python", "SQL", "Kubernetes"]);
  });

  it.each([
    "About Acme\nWe build tools for hospitals.",
    "Company Description\nWe build tools for hospitals.",
    "About the team\nWe build tools for hospitals.",
    "Our commitment to diversity\nEveryone belongs here.",
  ])("does not leak a company section into requirements: %s", (companySection) => {
    const brief = summarizeJobDescription(`Requirements\nPython\n${companySection}`);
    expect(brief.mustHaves).toEqual(["Python"]);
  });

  it("skips company copy so it cannot crowd out the actual role overview", () => {
    const brief = summarizeJobDescription(
      "About Acme\nWe make hospital software.\nOur platform serves clinicians worldwide.\nAbout the role\nOwn the ML platform for diagnostic models.",
    );
    expect(brief.overview).toEqual(["Own the ML platform for diagnostic models."]);
  });

  it.each(["Why join us", "Why Acme:", "Our benefits", "Life at Acme", "EEO Statement"])(
    "does not leak %s content into requirements",
    (heading) => {
      const brief = summarizeJobDescription(
        `Requirements\nPython\n${heading}\nA collaborative culture\nGenerous annual leave`,
      );
      expect(brief.mustHaves).toEqual(["Python"]);
    },
  );

  it("recognizes role headings that follow ignored company copy", () => {
    expect(
      summarizeJobDescription(
        "About Acme\nWe make software.\nThe Role\nBuild APIs for clinicians.",
      ).overview,
    ).toEqual(["Build APIs for clinicians."]);

    expect(
      summarizeJobDescription(
        "About Acme\nWe make software.\nWhat you will be doing\nBuild APIs for clinicians.",
      ).responsibilities,
    ).toEqual(["Build APIs for clinicians."]);
  });

  it("keeps 'why this role matters' as role overview rather than company marketing", () => {
    const brief = summarizeJobDescription(
      "Why this role matters\nBuild systems that improve patient safety.\nRequirements\nPython",
    );
    expect(brief.overview).toEqual(["Build systems that improve patient safety."]);
    expect(brief.mustHaves).toEqual(["Python"]);
  });
});
