export type JobBrief = {
  overview: string[];
  responsibilities: string[];
  mustHaves: string[];
  niceToHaves: string[];
  logistics: string[];
  keywords: string[];
};

type BriefSection = Exclude<keyof JobBrief, "keywords">;

const SECTION_LIMIT = 6;
const OVERVIEW_LIMIT = 2;
const KEYWORD_LIMIT = 10;

const headingPatterns: Array<{ section: BriefSection; pattern: RegExp }> = [
  {
    section: "responsibilities",
    pattern: /^(?:what\s+you(?:'|’)ll\s+be\s+doing|what\s+you\s+will\s+be\s+doing)$/i,
  },
  {
    section: "responsibilities",
    pattern:
      /^(?:key\s+)?(?:responsibilities|duties|what\s+you(?:'|’)ll\s+do|what\s+you\s+will\s+do|your\s+impact|day[- ]to[- ]day)$/i,
  },
  {
    section: "mustHaves",
    pattern:
      /^(?:(?:minimum\s+|required\s+|key\s+)?(?:requirements|qualifications|experience(?:\s+with)?|(?:technical\s+)?skills|education))$/i,
  },
  {
    section: "mustHaves",
    pattern:
      /^(?:(?:minimum\s+|required\s+)?(?:requirements|qualifications|experience|skills)|what\s+you(?:'|’)ll\s+need|what\s+you\s+will\s+need|must[- ]haves?|who\s+you\s+are)$/i,
  },
  {
    section: "niceToHaves",
    pattern:
      /^(?:preferred(?:\s+qualifications?|\s+skills?)?|nice[- ]to[- ]haves?|bonus(?:\s+points?)?|desired(?:\s+skills?)?)$/i,
  },
  {
    section: "logistics",
    pattern:
      /^(?:location(?:\s+and\s+compensation)?|work(?:ing)?\s+arrangement|workplace|compensation|salary|pay|benefits|perks|what\s+we\s+offer|employment\s+details)$/i,
  },
  {
    section: "overview",
    pattern: /^(?:about\s+the\s+role|(?:the|your)\s+role|why\s+this\s+role\s+matters|(?:job|position|role)\s+(?:description|overview|summary)|the\s+(?:opportunity|position)|overview|summary)$/i,
  },
];

const niceToHaveSignal = /\b(?:preferred|ideally|nice\s+to\s+have|bonus|a\s+plus|advantageous|desirable)\b/i;
const mustHaveSignal =
  /\b(?:required|must|minimum|at\s+least|need(?:ed)?|essential|proficien(?:t|cy)|\d+\+?\s+years?(?:\s+of)?\s+experience)\b/i;
const responsibilitySignal =
  /^(?:you(?:'|’)ll|you\s+will|in\s+this\s+role|responsible\s+for|own|lead|build|design|develop|create|deliver|manage|collaborate|partner|analy[sz]e|implement|maintain|drive|support)\b/i;
const logisticsSignal =
  /(?:[$€£¥]\s?\d|\b(?:salary|compensation|pay\s+range|remote|hybrid|on[- ]?site|location|relocation|visa|travel|hours|time\s*zone|full[- ]time|part[- ]time|contract|benefits?|vacation|leave|equity)\b)/i;
const nonRoleHeadingSignal =
  /^(?:about\s+(?!(?:the\s+)?role\b).+|company\s+(?:description|overview|profile)|who\s+we\s+are|(?:meet|about)\s+the\s+team|(?:our|the)\s+(?:benefits?|people|team)|our\s+(?:commitment\s+to\s+.+|culture|values|mission|story)|why\s+(?!(?:this|the)\s+role\b).+|life\s+at\s+.+|culture|values|eeo(?:\s+statement)?|equal\s+(?:employment\s+)?opportunity|diversity(?:\s+and\s+inclusion)?|how\s+to\s+apply|(?:application|hiring|interview)\s+process|how\s+we\s+hire|privacy|legal)$/i;
const boilerplateSignal =
  /\b(?:equal\s+opportunity\s+employer|all\s+qualified\s+applicants|without\s+regard\s+to|reasonable\s+accommodation|privacy\s+notice)\b/i;
const shortTechnicalKeywords = new Set(["ai", "c", "c#", "go", "js", "ml", "r"]);

const stopWords = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "because",
  "been",
  "being",
  "build",
  "company",
  "experience",
  "could",
  "from",
  "have",
  "into",
  "job",
  "preferred",
  "qualification",
  "qualifications",
  "required",
  "requirement",
  "requirements",
  "more",
  "our",
  "role",
  "skill",
  "skills",
  "team",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "through",
  "using",
  "what",
  "when",
  "where",
  "which",
  "will",
  "with",
  "work",
  "would",
  "you",
  "your",
  "years",
]);

function stripListMarker(value: string): string {
  return value.replace(/^\s*(?:[-*•▪◦–—]|\d+[.)])\s+/, "").trim();
}

function cleanHeading(value: string): string {
  return value.replace(/[:：]\s*$/, "").trim();
}

function sectionForHeading(value: string): BriefSection | null {
  const heading = cleanHeading(value);
  if (heading.length > 80) return null;
  return headingPatterns.find(({ pattern }) => pattern.test(heading))?.section ?? null;
}

function sectionBoundary(value: string, currentSection: BriefSection | null): "ignore" | "reset" | "keep" | null {
  const heading = cleanHeading(value);
  if (heading.length > 80) return null;
  if (nonRoleHeadingSignal.test(heading)) return "ignore";
  if (/:$/.test(value.trim())) return currentSection ? "keep" : "reset";
  return null;
}

function splitLongLine(value: string): string[] {
  if (value.length <= 280) return [value];
  const sentences = value.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((item) => item.trim());
  return sentences.length > 1 ? sentences : [value];
}

function descriptionUnits(description: string): string[] {
  return description
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .flatMap((line) => splitLongLine(line.trim()))
    .map(stripListMarker)
    .filter((line) => line.length > 0);
}

function classifyWithoutHeading(value: string): BriefSection | null {
  if (niceToHaveSignal.test(value)) return "niceToHaves";
  if (logisticsSignal.test(value)) return "logistics";
  if (mustHaveSignal.test(value)) return "mustHaves";
  if (responsibilitySignal.test(value)) return "responsibilities";
  return null;
}

function addUnique(target: string[], value: string, limit: number): void {
  if (target.length >= limit) return;
  const normalized = value.toLocaleLowerCase();
  if (!target.some((item) => item.toLocaleLowerCase() === normalized)) target.push(value);
}

function keywordTokens(value: string): string[] {
  return value.match(
    /(?:\.[A-Za-z][A-Za-z0-9]*|[A-Za-z][A-Za-z0-9]*(?:\+\+|#)|[A-Za-z][A-Za-z0-9]*(?:[./-][A-Za-z0-9+#]+)+|[A-Za-z][A-Za-z0-9]*)/g,
  ) ?? [];
}

function isShortTechnicalKeyword(token: string): boolean {
  const normalized = token.toLocaleLowerCase();
  if (!shortTechnicalKeywords.has(normalized)) return false;
  return token === "Go" || token === token.toLocaleUpperCase() || /[+#]/.test(token);
}

function extractKeywords(description: string, brief: Omit<JobBrief, "keywords">): string[] {
  const firstSpelling = new Map<string, string>();
  const counts = new Map<string, number>();
  const requirementTokens = new Set(
    keywordTokens([...brief.mustHaves, ...brief.niceToHaves].join(" ")).map((token) =>
      token.toLocaleLowerCase(),
    ),
  );
  const tokens = keywordTokens(description);

  for (const token of tokens) {
    const normalized = token.toLocaleLowerCase();
    if ((normalized.length < 3 && !isShortTechnicalKeyword(token)) || stopWords.has(normalized)) continue;
    firstSpelling.set(normalized, firstSpelling.get(normalized) ?? token);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts]
    .map(([normalized, count]) => {
      const spelling = firstSpelling.get(normalized) ?? normalized;
      const requirementBoost = requirementTokens.has(normalized) ? 3 : 0;
      const technicalBoost = /[A-Z].*[A-Z]|[.+#/-]|\d/.test(spelling) || isShortTechnicalKeyword(spelling) ? 2 : 0;
      return { spelling, score: count + requirementBoost + technicalBoost };
    })
    .sort((left, right) => right.score - left.score || left.spelling.localeCompare(right.spelling))
    .slice(0, KEYWORD_LIMIT)
    .map(({ spelling }) => spelling);
}

/**
 * Extracts a concise role brief without generating or paraphrasing claims.
 * Every returned sentence and keyword is copied from the preserved description.
 */
export function summarizeJobDescription(description: string): JobBrief {
  const brief: Omit<JobBrief, "keywords"> = {
    overview: [],
    responsibilities: [],
    mustHaves: [],
    niceToHaves: [],
    logistics: [],
  };
  let currentSection: BriefSection | null = null;
  let ignoringNonRoleSection = false;

  for (const unit of descriptionUnits(description)) {
    const headingSection = sectionForHeading(unit);
    if (headingSection) {
      currentSection = headingSection;
      ignoringNonRoleSection = false;
      continue;
    }

    const boundary = sectionBoundary(unit, currentSection);
    if (boundary) {
      if (boundary === "ignore") {
        currentSection = null;
        ignoringNonRoleSection = true;
      } else if (boundary === "reset") {
        currentSection = null;
        ignoringNonRoleSection = false;
      }
      continue;
    }
    if (ignoringNonRoleSection) continue;
    if (boilerplateSignal.test(unit)) continue;

    const inferredSection = classifyWithoutHeading(unit);
    const section = currentSection ?? inferredSection;
    if (section) {
      addUnique(brief[section], unit, section === "overview" ? OVERVIEW_LIMIT : SECTION_LIMIT);
      continue;
    }

    addUnique(brief.overview, unit, OVERVIEW_LIMIT);
  }

  return { ...brief, keywords: extractKeywords(description, brief) };
}
