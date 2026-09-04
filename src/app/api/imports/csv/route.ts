import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthRequiredError, requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { DataConflictError, DataNotFoundError } from "@/lib/data/repository";
import {
  EMPLOYMENT_TYPES,
  WORKPLACE_TYPES,
  type ImportError,
} from "@/lib/data/types";
import {
  CSV_JOB_VALUE_LIMITS,
  CsvImportError,
  parseJobsCsv,
} from "@/lib/import/csv";

const MAX_SYNCHRONOUS_ROWS = 100;
const SAFE_ROW_IMPORT_ERROR = "This row could not be imported.";

// JSON escaping adds overhead, so keep previews below the platform request cap.
const previewSchema = z.object({
  csv: z.string().min(1).max(3 * 1024 * 1024),
  fileName: z.string().max(255).optional(),
  commit: z.literal(false),
}).strict();

const httpUrl = z.string()
  .trim()
  .max(CSV_JOB_VALUE_LIMITS.sourceUrl)
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  })
  .transform((value) => new URL(value).toString());

const canonicalIsoInstant = z.string()
  .max(CSV_JOB_VALUE_LIMITS.publishedAt)
  .refine((value) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
  });

const reviewedJobSchema = z.object({
  title: z.string().trim().min(1).max(CSV_JOB_VALUE_LIMITS.title),
  company: z.string().trim().min(1).max(CSV_JOB_VALUE_LIMITS.company),
  description: z.string().trim().min(1).max(CSV_JOB_VALUE_LIMITS.description),
  location: z.string().trim().min(1).max(CSV_JOB_VALUE_LIMITS.location).optional(),
  workplaceType: z.enum(WORKPLACE_TYPES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  sourceUrl: httpUrl.optional(),
  externalId: z.string().trim().min(1).max(CSV_JOB_VALUE_LIMITS.externalId).optional(),
  salaryMin: z.number().finite().nonnegative().optional(),
  salaryMax: z.number().finite().nonnegative().optional(),
  salaryCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  publishedAt: canonicalIsoInstant.optional(),
}).strict().superRefine((job, context) => {
  if (
    job.salaryMin !== undefined
    && job.salaryMax !== undefined
    && job.salaryMin > job.salaryMax
  ) {
    context.addIssue({
      code: "custom",
      message: "Minimum salary cannot exceed maximum salary.",
      path: ["salaryMin"],
    });
  }
});

const previewErrorSchema = z.object({
  row: z.number().int().min(2),
  field: z.enum([
    "row",
    "title",
    "company",
    "description",
    "location",
    "workplaceType",
    "employmentType",
    "sourceUrl",
    "externalId",
    "salaryMin",
    "salaryMax",
    "salaryCurrency",
    "publishedAt",
  ]).optional(),
  code: z.enum([
    "required",
    "column_count",
    "invalid_value",
    "invalid_number",
    "invalid_range",
    "invalid_url",
    "invalid_date",
    "too_long",
  ]).optional(),
  message: z.string().min(1).max(1_000),
  value: z.string().max(512 * 1024).optional(),
}).strict();

const commitSchema = z.object({
  jobs: z.array(reviewedJobSchema).max(MAX_SYNCHRONOUS_ROWS),
  jobRows: z.array(z.number().int().min(2)).max(MAX_SYNCHRONOUS_ROWS),
  previewErrors: z.array(previewErrorSchema).max(MAX_SYNCHRONOUS_ROWS * 16),
  totalRows: z.number().int().min(1).max(MAX_SYNCHRONOUS_ROWS),
  fileName: z.string().max(255).optional(),
  commit: z.literal(true),
}).strict().superRefine((input, context) => {
  if (input.jobRows.length !== input.jobs.length) {
    context.addIssue({
      code: "custom",
      message: "Every reviewed job must retain its original CSV row.",
      path: ["jobRows"],
    });
  }

  const jobRows = new Set(input.jobRows);
  if (jobRows.size !== input.jobRows.length) {
    context.addIssue({
      code: "custom",
      message: "Reviewed CSV row numbers must be unique.",
      path: ["jobRows"],
    });
  }
  if (input.jobRows.some((row, index) => index > 0 && row <= input.jobRows[index - 1])) {
    context.addIssue({
      code: "custom",
      message: "Reviewed CSV row numbers must remain in source order.",
      path: ["jobRows"],
    });
  }

  const invalidRows = new Set(input.previewErrors.map((error) => error.row));
  if (input.jobRows.some((row) => invalidRows.has(row))) {
    context.addIssue({
      code: "custom",
      message: "A CSV row cannot be both reviewed and invalid.",
      path: ["previewErrors"],
    });
  }
  if (input.jobs.length + invalidRows.size !== input.totalRows) {
    context.addIssue({
      code: "custom",
      message: "CSV preview row counts do not match the reviewed import.",
      path: ["totalRows"],
    });
  }
});

function storedPreviewErrors(
  errors: readonly z.infer<typeof previewErrorSchema>[],
): ImportError[] {
  return errors.map(({ row, message, value }) => ({
    row,
    message,
    ...(value === undefined ? {} : { value }),
  }));
}

function storedPersistenceErrors(
  errors: readonly ImportError[],
  jobRows: readonly number[],
): ImportError[] {
  return errors.map((error) => ({
    row: jobRows[error.row - 1] ?? error.row,
    message: SAFE_ROW_IMPORT_ERROR,
  }));
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json(
      { error: "You must sign in to continue." },
      { status: 401 },
    );
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Invalid CSV import request." },
      { status: 400 },
    );
  }
  if (error instanceof CsvImportError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof DataConflictError || error instanceof DataNotFoundError) {
    return NextResponse.json(
      { error: "CSV import could not be completed." },
      { status: 400 },
    );
  }
  return NextResponse.json({ error: "CSV import failed." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const raw = await request.json();

    if (raw?.commit !== true) {
      const input = previewSchema.parse(raw);
      const result = parseJobsCsv(input.csv, { maxRows: MAX_SYNCHRONOUS_ROWS });
      return NextResponse.json(result);
    }

    if (Array.isArray(raw.jobs) && raw.jobs.length > MAX_SYNCHRONOUS_ROWS) {
      return NextResponse.json({
        error: `CSV imports are limited to ${MAX_SYNCHRONOUS_ROWS} rows per request.`,
      }, { status: 400 });
    }

    const input = commitSchema.parse(raw);
    const repository = await getDataRepository({ userId: user.id });
    const batch = await repository.createImportBatch({
      source: "csv",
      fileName: input.fileName,
      totalRows: input.totalRows,
      status: "processing",
    });
    const result = await repository.bulkCreateApplications(input.jobs.map((job) => ({
      job: { ...job, source: "csv" as const },
      application: { status: "saved" },
    })), batch.id);
    const persistenceErrors = storedPersistenceErrors(result.errors, input.jobRows);
    const errors = [
      ...storedPreviewErrors(input.previewErrors),
      ...persistenceErrors,
    ].sort((left, right) => left.row - right.row);
    const succeededRows = result.applications.length;
    const failedRows = Math.max(0, input.totalRows - succeededRows);

    if (input.totalRows !== input.jobs.length || result.errors.length > 0) {
      await repository.updateImportBatch(batch.id, {
        status: failedRows === 0 ? "completed" : succeededRows > 0 ? "partial" : "failed",
        totalRows: input.totalRows,
        processedRows: input.totalRows,
        succeededRows,
        failedRows,
        errors,
        completedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      applications: result.applications,
      errors,
      failedRows,
      succeededRows,
      totalRows: input.totalRows,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
