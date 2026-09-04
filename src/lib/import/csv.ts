import type {
  EmploymentType,
  JobCreateInput,
  WorkplaceType,
} from "../data/types";

export type CsvImportFatalCode =
  | "empty_csv"
  | "too_large"
  | "too_many_rows"
  | "too_many_columns"
  | "field_too_large"
  | "malformed_csv"
  | "missing_header"
  | "duplicate_header";

export class CsvImportError extends Error {
  readonly code: CsvImportFatalCode;
  readonly row?: number;
  readonly column?: number;

  constructor(
    code: CsvImportFatalCode,
    message: string,
    location: { row?: number; column?: number } = {},
  ) {
    super(message);
    this.name = "CsvImportError";
    this.code = code;
    this.row = location.row;
    this.column = location.column;
  }
}

export type CsvJobValidationCode =
  | "required"
  | "column_count"
  | "invalid_value"
  | "invalid_number"
  | "invalid_range"
  | "invalid_url"
  | "invalid_date"
  | "too_long";

export interface CsvJobValidationError {
  /** One-based CSV row, including the header row. */
  row: number;
  field: keyof JobCreateInput | "row";
  code: CsvJobValidationCode;
  message: string;
  value?: string;
}

export interface CsvJobImportResult {
  jobs: JobCreateInput[];
  /** Physical one-based CSV row where each valid job record starts. */
  jobRows: number[];
  errors: CsvJobValidationError[];
  /** Count of non-empty data rows, including invalid rows. */
  totalRows: number;
}

export interface CsvJobImportOptions {
  maxBytes?: number;
  maxRows?: number;
  maxColumns?: number;
  maxFieldLength?: number;
}

type JobColumn =
  | "title"
  | "company"
  | "description"
  | "location"
  | "workplaceType"
  | "employmentType"
  | "sourceUrl"
  | "externalId"
  | "salaryMin"
  | "salaryMax"
  | "salaryCurrency"
  | "publishedAt";

const DEFAULT_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxRows: 5_000,
  maxColumns: 64,
  maxFieldLength: 512 * 1024,
} as const;

const HEADER_ALIASES: Readonly<Record<string, JobColumn>> = {
  title: "title",
  job_title: "title",
  role: "title",
  position: "title",
  company: "company",
  company_name: "company",
  employer: "company",
  organisation: "company",
  organization: "company",
  description: "description",
  job_description: "description",
  details: "description",
  location: "location",
  city: "location",
  workplace: "workplaceType",
  workplace_type: "workplaceType",
  work_mode: "workplaceType",
  remote_type: "workplaceType",
  employment: "employmentType",
  employment_type: "employmentType",
  job_type: "employmentType",
  source_url: "sourceUrl",
  job_url: "sourceUrl",
  url: "sourceUrl",
  link: "sourceUrl",
  external_id: "externalId",
  job_id: "externalId",
  salary_min: "salaryMin",
  min_salary: "salaryMin",
  salary_max: "salaryMax",
  max_salary: "salaryMax",
  salary_currency: "salaryCurrency",
  currency: "salaryCurrency",
  published_at: "publishedAt",
  published: "publishedAt",
  date_posted: "publishedAt",
  posted_at: "publishedAt",
};

const WORKPLACE_VALUES: Readonly<Record<string, WorkplaceType>> = {
  remote: "remote",
  hybrid: "hybrid",
  onsite: "onsite",
  on_site: "onsite",
  in_office: "onsite",
  office: "onsite",
  unspecified: "unspecified",
  unknown: "unspecified",
};

const EMPLOYMENT_VALUES: Readonly<Record<string, EmploymentType>> = {
  full_time: "full_time",
  fulltime: "full_time",
  permanent: "full_time",
  part_time: "part_time",
  parttime: "part_time",
  contract: "contract",
  contractor: "contract",
  internship: "internship",
  intern: "internship",
  temporary: "temporary",
  temp: "temporary",
  unspecified: "unspecified",
  unknown: "unspecified",
};

export const CSV_JOB_VALUE_LIMITS = {
  title: 300,
  company: 300,
  description: 500_000,
  location: 500,
  sourceUrl: 2_048,
  externalId: 512,
  salaryCurrency: 3,
  publishedAt: 100,
} as const satisfies Readonly<Partial<Record<JobColumn, number>>>;

interface ParsedCsvRow {
  values: string[];
  /** Physical one-based line where this logical CSV record starts. */
  sourceRow: number;
}

function positiveLimit(value: number | undefined, fallback: number, allowZero = false): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0 || (!allowZero && value === 0)) {
    throw new TypeError("CSV limits must be positive safe integers");
  }
  return value;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseCsvDocument(
  csv: string,
  limits: { maxColumns: number; maxFieldLength: number },
): ParsedCsvRow[] {
  const rows: ParsedCsvRow[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;
  let physicalRow = 1;
  let physicalColumn = 0;
  let sourceRow = 1;

  const append = (character: string) => {
    field += character;
    if (field.length > limits.maxFieldLength) {
      throw new CsvImportError("field_too_large", "A CSV field exceeds the configured limit", {
        row: physicalRow,
        column: row.length + 1,
      });
    }
  };

  const pushField = () => {
    row.push(field);
    field = "";
    afterQuote = false;
    if (row.length > limits.maxColumns) {
      throw new CsvImportError("too_many_columns", "A CSV row has too many columns", {
        row: physicalRow,
        column: row.length,
      });
    }
  };

  const pushRow = () => {
    pushField();
    rows.push({ values: row, sourceRow });
    row = [];
  };

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    physicalColumn += 1;

    if (inQuotes) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          append('"');
          index += 1;
          physicalColumn += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else if (character === "\r" || character === "\n") {
        if (character === "\r" && csv[index + 1] === "\n") index += 1;
        append("\n");
        physicalRow += 1;
        physicalColumn = 0;
      } else {
        append(character);
      }
      continue;
    }

    if (afterQuote) {
      if (character === ",") {
        pushField();
      } else if (character === "\r" || character === "\n") {
        if (character === "\r" && csv[index + 1] === "\n") index += 1;
        pushRow();
        physicalRow += 1;
        physicalColumn = 0;
        sourceRow = physicalRow;
      } else if (character !== " " && character !== "\t") {
        throw new CsvImportError(
          "malformed_csv",
          "Unexpected character after a quoted CSV field",
          { row: physicalRow, column: physicalColumn },
        );
      }
      continue;
    }

    if (character === ",") {
      pushField();
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      pushRow();
      physicalRow += 1;
      physicalColumn = 0;
      sourceRow = physicalRow;
    } else if (character === '"') {
      if (field.length !== 0) {
        throw new CsvImportError("malformed_csv", "Unexpected quote in an unquoted CSV field", {
          row: physicalRow,
          column: physicalColumn,
        });
      }
      inQuotes = true;
    } else {
      append(character);
    }
  }

  if (inQuotes) {
    throw new CsvImportError("malformed_csv", "Unterminated quoted CSV field", {
      row: physicalRow,
      column: row.length + 1,
    });
  }

  if (field.length > 0 || row.length > 0 || afterQuote) pushRow();
  return rows;
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isEmptyRow(row: readonly string[]): boolean {
  return row.every((value) => value.trim() === "");
}

function parseIsoInstant(value: string): string | null {
  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!calendarDate) return null;
  const [, year, month, day] = calendarDate;
  const midnight = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const actualDate = midnight.toISOString().slice(0, 10);
  if (actualDate !== `${year}-${month}-${day}`) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00.000Z`;
  const rfc3339 = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  if (!rfc3339.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function createHeaderMap(header: readonly string[]): Map<JobColumn, number> {
  const columns = new Map<JobColumn, number>();
  for (let index = 0; index < header.length; index += 1) {
    const mapped = HEADER_ALIASES[normalizeToken(header[index])];
    if (!mapped) continue;
    if (columns.has(mapped)) {
      throw new CsvImportError(
        "duplicate_header",
        `Multiple CSV columns map to '${mapped}'`,
        { row: 1, column: index + 1 },
      );
    }
    columns.set(mapped, index);
  }

  for (const required of ["title", "company", "description"] as const) {
    if (!columns.has(required)) {
      throw new CsvImportError(
        "missing_header",
        `CSV is missing a required '${required}' column`,
        { row: 1 },
      );
    }
  }
  return columns;
}

function validateJobRow(
  row: readonly string[],
  csvRow: number,
  headerLength: number,
  columns: ReadonlyMap<JobColumn, number>,
): { job?: JobCreateInput; errors: CsvJobValidationError[] } {
  const errors: CsvJobValidationError[] = [];
  const value = (column: JobColumn): string => {
    const index = columns.get(column);
    return index === undefined ? "" : (row[index] ?? "").trim();
  };
  const addError = (
    field: CsvJobValidationError["field"],
    code: CsvJobValidationCode,
    message: string,
    invalidValue?: string,
  ) => errors.push({ row: csvRow, field, code, message, ...(invalidValue ? { value: invalidValue } : {}) });

  if (row.length > headerLength && row.slice(headerLength).some((item) => item.trim() !== "")) {
    addError("row", "column_count", "Row contains more values than the header");
  }

  const title = value("title");
  const company = value("company");
  const description = value("description");
  if (!title) addError("title", "required", "Job title is required");
  if (!company) addError("company", "required", "Company is required");
  if (!description) addError("description", "required", "Job description is required");

  for (const [field, limit] of Object.entries(CSV_JOB_VALUE_LIMITS) as [JobColumn, number][]) {
    const fieldValue = value(field);
    if (fieldValue.length > limit) {
      addError(field, "too_long", `${field} must be at most ${limit} characters`);
    }
  }

  const workplaceRaw = value("workplaceType");
  const workplaceType = workplaceRaw ? WORKPLACE_VALUES[normalizeToken(workplaceRaw)] : undefined;
  if (workplaceRaw && !workplaceType) {
    addError("workplaceType", "invalid_value", "Unknown workplace type", workplaceRaw);
  }

  const employmentRaw = value("employmentType");
  const employmentType = employmentRaw ? EMPLOYMENT_VALUES[normalizeToken(employmentRaw)] : undefined;
  if (employmentRaw && !employmentType) {
    addError("employmentType", "invalid_value", "Unknown employment type", employmentRaw);
  }

  const sourceUrlRaw = value("sourceUrl");
  let sourceUrl: string | undefined;
  if (sourceUrlRaw) {
    try {
      const parsed = new URL(sourceUrlRaw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("protocol");
      sourceUrl = parsed.toString();
    } catch {
      addError("sourceUrl", "invalid_url", "Source URL must be an absolute HTTP(S) URL", sourceUrlRaw);
    }
  }

  const parseSalary = (field: "salaryMin" | "salaryMax"): number | undefined => {
    const raw = value(field);
    if (!raw) return undefined;
    const parsed = Number(raw);
    if (!/^(?:\d+\.?\d*|\.\d+)$/.test(raw) || !Number.isFinite(parsed) || parsed < 0) {
      addError(field, "invalid_number", `${field} must be a non-negative number`, raw);
      return undefined;
    }
    return parsed;
  };
  const salaryMin = parseSalary("salaryMin");
  const salaryMax = parseSalary("salaryMax");
  if (salaryMin !== undefined && salaryMax !== undefined && salaryMin > salaryMax) {
    addError("salaryMin", "invalid_range", "Minimum salary cannot exceed maximum salary");
  }

  const currencyRaw = value("salaryCurrency");
  const salaryCurrency = currencyRaw ? currencyRaw.toUpperCase() : undefined;
  if (currencyRaw && !/^[A-Z]{3}$/.test(salaryCurrency ?? "")) {
    addError("salaryCurrency", "invalid_value", "Salary currency must be a three-letter code", currencyRaw);
  }

  const publishedRaw = value("publishedAt");
  let publishedAt: string | undefined;
  if (publishedRaw) {
    const parsed = parseIsoInstant(publishedRaw);
    if (!parsed) {
      addError("publishedAt", "invalid_date", "Published date must be a valid date", publishedRaw);
    } else {
      publishedAt = parsed;
    }
  }

  if (errors.length > 0) return { errors };

  const job: JobCreateInput = { title, company, description, source: "csv" };
  const location = value("location");
  const externalId = value("externalId");
  if (location) job.location = location;
  if (workplaceType) job.workplaceType = workplaceType;
  if (employmentType) job.employmentType = employmentType;
  if (sourceUrl) job.sourceUrl = sourceUrl;
  if (externalId) job.externalId = externalId;
  if (salaryMin !== undefined) job.salaryMin = salaryMin;
  if (salaryMax !== undefined) job.salaryMax = salaryMax;
  if (salaryCurrency) job.salaryCurrency = salaryCurrency;
  if (publishedAt) job.publishedAt = publishedAt;
  return { job, errors };
}

/**
 * Parses a CSV export into validated repository-ready job inputs. Fatal document
 * problems throw `CsvImportError`; row-level problems are accumulated so callers
 * can import valid rows and present precise feedback for the rest.
 */
export function parseJobsCsv(csv: string, options: CsvJobImportOptions = {}): CsvJobImportResult {
  const maxBytes = positiveLimit(options.maxBytes, DEFAULT_LIMITS.maxBytes, true);
  const maxRows = positiveLimit(options.maxRows, DEFAULT_LIMITS.maxRows, true);
  const maxColumns = positiveLimit(options.maxColumns, DEFAULT_LIMITS.maxColumns);
  const maxFieldLength = positiveLimit(options.maxFieldLength, DEFAULT_LIMITS.maxFieldLength);

  if (utf8Length(csv) > maxBytes) {
    throw new CsvImportError("too_large", "CSV exceeds the configured byte limit");
  }
  if (csv.trim().replace(/^\ufeff/, "") === "") {
    throw new CsvImportError("empty_csv", "CSV is empty");
  }

  const parsedRows = parseCsvDocument(csv, { maxColumns, maxFieldLength });
  const firstNonEmpty = parsedRows.findIndex((row) => !isEmptyRow(row.values));
  if (firstNonEmpty === -1) throw new CsvImportError("empty_csv", "CSV is empty");

  const header = parsedRows[firstNonEmpty].values;
  const columns = createHeaderMap(header);
  const dataRows = parsedRows
    .slice(firstNonEmpty + 1)
    .filter((row) => !isEmptyRow(row.values));
  if (dataRows.length > maxRows) {
    throw new CsvImportError("too_many_rows", `CSV exceeds the ${maxRows}-row limit`);
  }

  const jobs: JobCreateInput[] = [];
  const jobRows: number[] = [];
  const errors: CsvJobValidationError[] = [];
  for (const dataRow of dataRows) {
    const validated = validateJobRow(
      dataRow.values,
      dataRow.sourceRow,
      header.length,
      columns,
    );
    if (validated.job) {
      jobs.push(validated.job);
      jobRows.push(dataRow.sourceRow);
    }
    errors.push(...validated.errors);
  }
  return { totalRows: dataRows.length, jobs, jobRows, errors };
}
