const SECTION_TITLES = new Map<string, string>([
  ["summary", "Professional Summary"],
  ["profile", "Professional Summary"],
  ["professional summary", "Professional Summary"],
  ["career objective", "Professional Summary"],
  ["experience", "Experience"],
  ["work experience", "Experience"],
  ["professional experience", "Experience"],
  ["employment history", "Experience"],
  ["work history", "Experience"],
  ["education", "Education"],
  ["academic background", "Education"],
  ["skills", "Skills"],
  ["technical skills", "Skills"],
  ["core skills", "Skills"],
  ["core competencies", "Skills"],
  ["technical expertise", "Skills"],
  ["projects", "Projects"],
  ["selected projects", "Projects"],
  ["certifications", "Certifications"],
  ["certificates", "Certifications"],
  ["languages", "Languages"],
]);

const COMPACT_SECTION_TITLES = new Map(
  [...SECTION_TITLES].map(([label, title]) => [label.replace(/[^\p{L}\p{N}]+/gu, ""), title]),
);

function canonicalSection(line: string): string | null {
  const candidate = line
    .replace(/^#{1,6}\s+/, "")
    .replace(/[:\s]+$/, "")
    .trim()
    .toLocaleLowerCase();
  return SECTION_TITLES.get(candidate)
    ?? COMPACT_SECTION_TITLES.get(candidate.replace(/[^\p{L}\p{N}]+/gu, ""))
    ?? null;
}

export function canonicalizeCvMarkdown(input: string): string {
  const lines = input
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trimEnd());

  const output: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const section = canonicalSection(line);
    if (section) {
      output.push(`## ${section}`);
      continue;
    }
    const bullet = line.match(/^[•●▪◦‣]\s*(.+)$/u);
    output.push(bullet ? `- ${bullet[1]}` : line);
  }

  return output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type AtsCheckStatus = "pass" | "warning" | "fail";

export interface AtsCheck {
  id: "parsing" | "sections" | "contact" | "length" | "formatting";
  label: string;
  status: AtsCheckStatus;
  message: string;
}

export interface AtsReport {
  score: number;
  rating: "Strong" | "Review" | "High risk";
  wordCount: number;
  checks: AtsCheck[];
  disclaimer: string;
}

function check(
  id: AtsCheck["id"],
  label: string,
  status: AtsCheckStatus,
  message: string,
  weight: number,
) {
  return {
    check: { id, label, status, message } satisfies AtsCheck,
    points: status === "pass" ? weight : status === "warning" ? Math.round(weight / 2) : 0,
  };
}

function containsPhoneNumber(content: string): boolean {
  const candidates = content.match(/(?:\+?\d[\d\t ().\-–—]{5,}\d)/g) ?? [];
  return candidates.some((candidate) => {
    const normalized = candidate.trim();
    if (/^(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)\d{2}$/.test(normalized)) return false;
    if (/^(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(normalized)) return false;
    const digitCount = (normalized.match(/\d/g) ?? []).length;
    return digitCount >= 7 && digitCount <= 15;
  });
}

export function scanCvForAts(input: {
  content: string;
  fileName?: string | null;
  mimeType?: string | null;
}): AtsReport {
  const content = input.content.trim();
  const words = content.match(/[\p{L}\p{N}][\p{L}\p{N}+#.'’-]*/gu) ?? [];
  const wordCount = words.length;
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const parsing = wordCount >= 150
    ? check("parsing", "Text extraction", "pass", `${wordCount} words are available to an ATS.`, 30)
    : wordCount >= 80
      ? check("parsing", "Text extraction", "warning", `Only ${wordCount} words were extracted; verify the PDF is text-based.`, 30)
      : check("parsing", "Text extraction", "fail", `Only ${wordCount} words were extracted; this may be an image-only or unusually formatted CV.`, 30);

  const detectedSections = new Set(lines.map(canonicalSection).filter((section) => section !== null));
  const standardSections = ["experience", "education", "skills"].filter((section) =>
    detectedSections.has(section[0].toLocaleUpperCase() + section.slice(1)),
  );
  const sections = standardSections.length === 3
    ? check("sections", "Standard sections", "pass", "Experience, education, and skills sections are clearly labeled.", 25)
    : standardSections.length === 2
      ? check("sections", "Standard sections", "warning", `Add a clearly labeled ${["experience", "education", "skills"].find((section) => !standardSections.includes(section))} section.`, 25)
      : check("sections", "Standard sections", "fail", "Use clearly labeled Experience, Education, and Skills sections.", 25);

  const hasEmail = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(content);
  const hasPhone = containsPhoneNumber(content);
  const contact = hasEmail && hasPhone
    ? check("contact", "Contact details", "pass", "An email address and phone number are readable as text.", 15)
    : hasEmail || hasPhone
      ? check("contact", "Contact details", "warning", `Add a text-based ${hasEmail ? "phone number" : "email address"}.`, 15)
      : check("contact", "Contact details", "fail", "No text-based email address or phone number was detected.", 15);

  const length = wordCount >= 250 && wordCount <= 1200
    ? check("length", "CV length", "pass", `${wordCount} words is within the usual ATS-friendly range.`, 15)
    : wordCount >= 150 && wordCount <= 1600
      ? check("length", "CV length", "warning", `${wordCount} words is readable, but review the amount of content.`, 15)
      : check("length", "CV length", "fail", `${wordCount} words is unusually short or long for a CV.`, 15);

  const replacementCharacters = (content.match(/\uFFFD/g) ?? []).length;
  const tableCharacters = (content.match(/[|│┆┊]/g) ?? []).length;
  const decorativeCharacters = (content.match(/[■◆★●▪◦‣]/gu) ?? []).length;
  const veryLongLines = lines.filter((line) => line.length > 180).length;
  const formattingRisk = replacementCharacters > 0 || tableCharacters > 12 || decorativeCharacters > 12 || veryLongLines > 3;
  const formatting = formattingRisk
    ? check("formatting", "Formatting signals", "warning", "The extracted text contains table, symbol, or line-length patterns that some ATS parsers may scramble.", 15)
    : check("formatting", "Formatting signals", "pass", "No strong signs of garbled extraction, tables, or decorative layout were detected.", 15);

  const weighted = [parsing, sections, contact, length, formatting];
  const score = weighted.reduce((total, item) => total + item.points, 0);
  return {
    score,
    rating: score >= 80 ? "Strong" : score >= 55 ? "Review" : "High risk",
    wordCount,
    checks: weighted.map((item) => item.check),
    disclaimer: "This is a deterministic compatibility check, not a guarantee from any employer's ATS.",
  };
}
