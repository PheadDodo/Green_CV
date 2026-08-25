import { describe, expect, it } from "vitest";

import { parseJobsCsv } from "./csv";

describe("parseJobsCsv", () => {
  it("parses common exports, quoted fields, aliases, and normalizes job values", () => {
    const csv = [
      "\ufeffRole,Employer,Job Description,City,Work Mode,Job Type,URL,Salary Min,Salary Max,Currency,Date Posted",
      '"Senior, ML Engineer",Acme,"Build reliable ""AI"" systems.\nOwn evaluation.",Kyiv,Remote,Full time,https://jobs.example/42,80000,120000,usd,2026-08-01',
    ].join("\r\n");

    expect(parseJobsCsv(csv)).toEqual({
      totalRows: 1,
      jobs: [
        {
          title: "Senior, ML Engineer",
          company: "Acme",
          description: 'Build reliable "AI" systems.\nOwn evaluation.',
          location: "Kyiv",
          workplaceType: "remote",
          employmentType: "full_time",
          source: "csv",
          sourceUrl: "https://jobs.example/42",
          salaryMin: 80000,
          salaryMax: 120000,
          salaryCurrency: "USD",
          publishedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      errors: [],
    });
  });

  it("keeps valid rows and reports actionable validation errors for invalid rows", () => {
    const csv = [
      "title,company,description,workplace_type,salary_min,salary_max,source_url",
      "ML Engineer,Acme,Build models,remote,100,200,https://example.com/job",
      "Data Scientist,,Analyze data,teleport,300,200,javascript:alert(1)",
      ",Example,Missing title,,,,",
    ].join("\n");

    const result = parseJobsCsv(csv);

    expect(result.totalRows).toBe(3);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({ title: "ML Engineer", source: "csv" });
    expect(result.errors).toEqual([
      expect.objectContaining({ row: 3, field: "company", code: "required" }),
      expect.objectContaining({ row: 3, field: "workplaceType", code: "invalid_value" }),
      expect.objectContaining({ row: 3, field: "sourceUrl", code: "invalid_url" }),
      expect.objectContaining({ row: 3, field: "salaryMin", code: "invalid_range" }),
      expect.objectContaining({ row: 4, field: "title", code: "required" }),
    ]);
  });

  it("rejects malformed documents and enforces resource limits with typed errors", () => {
    expect(() => parseJobsCsv('title,company,description\n"unterminated,Acme,text')).toThrowError(
      expect.objectContaining({ code: "malformed_csv" }),
    );

    expect(() =>
      parseJobsCsv("title,company,description\nEngineer,Acme,Description", { maxRows: 0 }),
    ).toThrowError(expect.objectContaining({ code: "too_many_rows" }));

    expect(() => parseJobsCsv("title,company\nEngineer,Acme")).toThrowError(
      expect.objectContaining({ code: "missing_header" }),
    );
  });

  it("rejects duplicate mapped columns rather than silently choosing one", () => {
    expect(() =>
      parseJobsCsv("title,role,company,description\nEngineer,Other,Acme,Build things"),
    ).toThrowError(expect.objectContaining({ code: "duplicate_header" }));
  });

  it("accepts only unambiguous, real ISO dates", () => {
    const result = parseJobsCsv(
      [
        "title,company,description,published_at",
        "Engineer,Acme,Valid date,2024-02-29",
        "Engineer,Acme,Impossible date,2026-02-29",
        "Engineer,Acme,Ambiguous date,08/01/2026",
      ].join("\n"),
    );

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].publishedAt).toBe("2024-02-29T00:00:00.000Z");
    expect(result.errors).toEqual([
      expect.objectContaining({ row: 3, field: "publishedAt", code: "invalid_date" }),
      expect.objectContaining({ row: 4, field: "publishedAt", code: "invalid_date" }),
    ]);
  });
});
