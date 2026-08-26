import { describe, expect, it } from "vitest";
import { canonicalizeCvMarkdown, scanCvForAts } from "./cv-artifacts";

describe("canonicalizeCvMarkdown", () => {
  it("turns extracted CV text into stable Markdown without changing its evidence", () => {
    const markdown = canonicalizeCvMarkdown(`
Alex Morgan
alex@example.com | +49 30 123456

PROFESSIONAL EXPERIENCE
• Built a Python evaluation service

EDUCATION
MSc Computer Science

SKILLS
Python, SQL, Docker
`);

    expect(markdown).toContain("Alex Morgan");
    expect(markdown).toContain("## Experience");
    expect(markdown).toContain("- Built a Python evaluation service");
    expect(markdown).toContain("## Education");
    expect(markdown).toContain("## Skills");
    expect(markdown).not.toContain("Kubernetes");
  });
});

describe("scanCvForAts", () => {
  it("recognizes a parseable CV with standard sections as ATS-compatible", () => {
    const experience = Array.from(
      { length: 18 },
      (_, index) => `- Delivered measurable Python and SQL project outcome ${index + 1} for a production team.`,
    ).join("\n");
    const report = scanCvForAts({
      content: `# Alex Morgan
alex@example.com | +49 30 123456

## Professional Summary
Machine learning engineer building reliable production systems.

## Experience
${experience}

## Education
MSc Computer Science, Example University

## Skills
Python, SQL, Docker, Statistics, Experimentation`,
      fileName: "alex-morgan.pdf",
      mimeType: "application/pdf",
    });

    expect(report.score).toBeGreaterThanOrEqual(80);
    expect(report.rating).toBe("Strong");
    expect(report.checks.every((check) => check.status !== "fail")).toBe(true);
  });

  it("flags sparse or garbled extraction for unusual-format review", () => {
    const report = scanCvForAts({
      content: `## Experience
Engineer � � �
||||||||||||||||

## Education
University

## Skills
Python`,
      fileName: "image-heavy.pdf",
      mimeType: "application/pdf",
    });

    expect(report.rating).toBe("High risk");
    expect(report.checks.find((check) => check.id === "parsing")?.status).toBe("fail");
    expect(report.checks.find((check) => check.id === "formatting")?.status).toBe("warning");
  });

  it("does not mistake an employment date range for a phone number", () => {
    const report = scanCvForAts({
      content: `Alex Morgan
alex@example.com

## Experience
Software Engineer | 2021 - 2024

## Education
University

## Skills
Python`,
    });

    expect(report.checks.find((check) => check.id === "contact")).toMatchObject({
      status: "warning",
      message: "Add a text-based phone number.",
    });
  });

  it("recognizes section labels whose spaces were collapsed by PDF extraction", () => {
    const report = scanCvForAts({
      content: `PROFESSIONALEXPERIENCE
Product Manager

## Education
University

CORESKILLS
Python, SQL`,
      mimeType: "application/pdf",
    });

    expect(report.checks.find((check) => check.id === "sections")).toMatchObject({
      status: "pass",
      message: "Experience, education, and skills sections are clearly labeled.",
    });
  });
});
