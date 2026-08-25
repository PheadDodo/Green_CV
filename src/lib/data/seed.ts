import type {
  Application,
  ApplicationEvent,
  ApplicationStatus,
  AutomationRule,
  AutomationRun,
  CvVersion,
  Evaluation,
  ImportBatch,
  Job,
  Reminder,
} from "./types";

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_USER_EMAIL = "alex@example.com";
export const DATA_STORE_SCHEMA_VERSION = 2 as const;

export interface DataStoreDocument {
  schemaVersion: typeof DATA_STORE_SCHEMA_VERSION;
  seededAt: string;
  jobs: Job[];
  applications: Application[];
  applicationEvents: ApplicationEvent[];
  cvVersions: CvVersion[];
  evaluations: Evaluation[];
  reminders: Reminder[];
  importBatches: ImportBatch[];
  automationRules: AutomationRule[];
  automationRuns: AutomationRun[];
}

const SEEDED_AT = "2026-08-21T08:00:00.000Z";
const ids = {
  jobs: [1, 2, 3, 4, 5, 6, 7].map(
    (number) => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  ),
  applications: [1, 2, 3, 4, 5, 6, 7].map(
    (number) => `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  ),
  cvs: [1, 2, 3, 4].map(
    (number) => `30000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  ),
  evaluations: [1, 2, 3].map(
    (number) => `40000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  ),
  events: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
    (number) => `50000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  ),
  reminders: [1, 2].map(
    (number) => `60000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  ),
  imports: [1].map(
    (number) => `70000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  ),
  automationRules: [1, 2, 3].map(
    (number) => `80000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  ),
  automationRuns: [1].map(
    (number) => `90000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  ),
};

function createJob(
  userId: string,
  index: number,
  input: Pick<Job, "title" | "company" | "description"> & Partial<Job>,
): Job {
  return {
    id: ids.jobs[index],
    userId,
    title: input.title,
    company: input.company,
    description: input.description,
    location: input.location ?? null,
    workplaceType: input.workplaceType ?? "unspecified",
    employmentType: input.employmentType ?? "full_time",
    source: input.source ?? "manual",
    sourceUrl: input.sourceUrl ?? null,
    externalId: input.externalId ?? null,
    salaryMin: input.salaryMin ?? null,
    salaryMax: input.salaryMax ?? null,
    salaryCurrency: input.salaryCurrency ?? null,
    publishedAt: input.publishedAt ?? null,
    createdAt: input.createdAt ?? SEEDED_AT,
    updatedAt: input.updatedAt ?? input.createdAt ?? SEEDED_AT,
  };
}

function createApplication(
  userId: string,
  index: number,
  status: ApplicationStatus,
  cvVersionId: string | null,
  timestamp: string,
): Application {
  return {
    id: ids.applications[index],
    userId,
    jobId: ids.jobs[index],
    status,
    cvVersionId,
    notes: null,
    appliedAt: status === "saved" ? null : timestamp,
    lastActivityAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createEvent(
  userId: string,
  index: number,
  applicationIndex: number,
  input: Omit<ApplicationEvent, "id" | "userId" | "applicationId" | "createdAt" | "metadata"> & {
    metadata?: ApplicationEvent["metadata"];
  },
): ApplicationEvent {
  return {
    id: ids.events[index],
    userId,
    applicationId: ids.applications[applicationIndex],
    ...input,
    metadata: input.metadata ?? {},
    createdAt: input.occurredAt,
  };
}

export function createSeedData(userId = DEMO_USER_ID): DataStoreDocument {
  const cvVersions: CvVersion[] = [
    {
      id: ids.cvs[0],
      userId,
      name: "ML Engineer v3",
      summary: "Production machine-learning systems, NLP, and MLOps.",
      content:
        "Machine Learning Engineer with experience shipping Python services, transformer models, model evaluation, and cloud deployment. Reduced inference latency by 18%.",
      fileName: "alex-ml-engineer-v3.pdf",
      storagePath: null,
      mimeType: "application/pdf",
      skills: ["Python", "PyTorch", "NLP", "MLOps", "Docker", "Kubernetes"],
      isDefault: true,
      createdAt: "2026-08-01T09:00:00.000Z",
      updatedAt: "2026-08-18T09:00:00.000Z",
    },
    {
      id: ids.cvs[1],
      userId,
      name: "Data Science v2",
      summary: "Experimentation, analytics, and predictive modelling.",
      content:
        "Data Scientist experienced in experimentation, statistical modelling, SQL, Python, and stakeholder communication.",
      fileName: "alex-data-science-v2.pdf",
      storagePath: null,
      mimeType: "application/pdf",
      skills: ["Python", "SQL", "Statistics", "Experimentation"],
      isDefault: false,
      createdAt: "2026-07-21T09:00:00.000Z",
      updatedAt: "2026-08-12T09:00:00.000Z",
    },
    {
      id: ids.cvs[2],
      userId,
      name: "Product ML v1",
      summary: "Product-oriented AI engineering.",
      content:
        "AI Product Engineer connecting model capabilities to customer outcomes and reliable product delivery.",
      fileName: "alex-product-ml-v1.pdf",
      storagePath: null,
      mimeType: "application/pdf",
      skills: ["Python", "Product discovery", "LLMs", "Evaluation"],
      isDefault: false,
      createdAt: "2026-07-30T09:00:00.000Z",
      updatedAt: "2026-07-30T09:00:00.000Z",
    },
    {
      id: ids.cvs[3],
      userId,
      name: "Analytics v4",
      summary: "Decision support and business analytics.",
      content: "Senior analyst with SQL, dashboarding, forecasting, and cross-functional leadership experience.",
      fileName: "alex-analytics-v4.pdf",
      storagePath: null,
      mimeType: "application/pdf",
      skills: ["SQL", "Python", "Forecasting", "BI"],
      isDefault: false,
      createdAt: "2026-08-02T09:00:00.000Z",
      updatedAt: "2026-08-15T09:00:00.000Z",
    },
  ];

  const jobs: Job[] = [
    createJob(userId, 0, {
      title: "Machine Learning Engineer",
      company: "Northstar AI",
      location: "Remote, Europe",
      workplaceType: "remote",
      description:
        "Build and deploy Python ML services, improve NLP models, own evaluation, and partner with product teams. Kubernetes experience is useful.",
      source: "url",
      sourceUrl: "https://example.com/jobs/northstar-ml-engineer",
      publishedAt: "2026-08-18T08:00:00.000Z",
      createdAt: "2026-08-18T08:30:00.000Z",
    }),
    createJob(userId, 1, {
      title: "Data Scientist",
      company: "Bright Data",
      location: "Berlin, Germany",
      workplaceType: "hybrid",
      description: "Design experiments, build forecasting models, and explain results to product leaders.",
      createdAt: "2026-08-16T10:00:00.000Z",
    }),
    createJob(userId, 2, {
      title: "AI Product Engineer",
      company: "Lattice Labs",
      location: "London, UK",
      workplaceType: "remote",
      description: "Prototype and ship LLM-powered workflows with rigorous evaluation and customer feedback loops.",
      createdAt: "2026-08-14T11:00:00.000Z",
    }),
    createJob(userId, 3, {
      title: "NLP Engineer",
      company: "Kiteworks",
      location: "Amsterdam, Netherlands",
      workplaceType: "onsite",
      description: "Fine-tune and serve multilingual transformer models for document understanding.",
      createdAt: "2026-08-17T12:00:00.000Z",
    }),
    createJob(userId, 4, {
      title: "Senior Data Analyst",
      company: "Arc Systems",
      location: "Remote",
      workplaceType: "remote",
      description: "Own product analytics, semantic models, KPI definitions, and executive reporting.",
      createdAt: "2026-08-15T14:00:00.000Z",
    }),
    createJob(userId, 5, {
      title: "Applied Scientist",
      company: "Fieldnote",
      location: "Paris, France",
      workplaceType: "hybrid",
      description: "Translate recent ML research into reliable ranking and recommendation systems.",
      createdAt: "2026-08-14T15:00:00.000Z",
    }),
    createJob(userId, 6, {
      title: "ML Platform Engineer",
      company: "Meridian",
      location: "Prague, Czechia",
      workplaceType: "onsite",
      description: "Build model deployment, observability, and feature platform capabilities.",
      createdAt: "2026-08-10T15:00:00.000Z",
    }),
  ];

  const applications: Application[] = [
    createApplication(userId, 0, "interview", ids.cvs[0], "2026-08-21T07:30:00.000Z"),
    createApplication(userId, 1, "applied", ids.cvs[1], "2026-08-19T10:00:00.000Z"),
    createApplication(userId, 2, "screening", ids.cvs[2], "2026-08-18T12:00:00.000Z"),
    createApplication(userId, 3, "saved", ids.cvs[0], "2026-08-17T12:00:00.000Z"),
    createApplication(userId, 4, "saved", ids.cvs[3], "2026-08-15T14:00:00.000Z"),
    createApplication(userId, 5, "applied", ids.cvs[0], "2026-08-14T15:00:00.000Z"),
    createApplication(userId, 6, "rejected", ids.cvs[0], "2026-08-10T15:00:00.000Z"),
  ];

  const evaluations: Evaluation[] = [
    {
      id: ids.evaluations[0],
      userId,
      applicationId: ids.applications[0],
      jobId: ids.jobs[0],
      cvVersionId: ids.cvs[0],
      status: "completed",
      recommendation: "apply",
      overallScore: 82,
      summary: "Strong production ML and NLP match. Address Kubernetes depth honestly.",
      strengths: [
        "Built and deployed Python ML services in production",
        "Direct NLP and transformer fine-tuning experience",
        "Cross-functional work with product and data teams",
        "Measured model quality with offline and online metrics",
      ],
      gaps: [
        "No direct experience with their feature-store stack",
        "Kubernetes depth is below the role's preference",
        "Leadership scope is not quantified",
      ],
      evidence: [
        {
          requirement: "Production Python ML services",
          cvEvidence: "Shipped Python inference services and reduced latency by 18%.",
          score: 95,
        },
        {
          requirement: "Kubernetes expertise",
          cvEvidence: "Lists basic Kubernetes deployment experience.",
          score: 55,
        },
      ],
      suggestedEdits: [
        "Surface the 18% inference latency reduction in the first bullet.",
        "Name the model evaluation framework used in production.",
        "Keep Kubernetes under familiarity rather than expertise.",
      ],
      model: "demo-evaluator",
      promptVersion: "2.1",
      errorMessage: null,
      createdAt: "2026-08-18T09:00:00.000Z",
      updatedAt: "2026-08-18T09:01:00.000Z",
      completedAt: "2026-08-18T09:01:00.000Z",
    },
    {
      id: ids.evaluations[1],
      userId,
      applicationId: ids.applications[1],
      jobId: ids.jobs[1],
      cvVersionId: ids.cvs[1],
      status: "completed",
      recommendation: "consider",
      overallScore: 76,
      summary: "Good analytical foundation with a moderate domain gap.",
      strengths: ["Experimentation", "Python and SQL", "Stakeholder communication"],
      gaps: ["Limited marketplace-data experience"],
      evidence: [],
      suggestedEdits: ["Quantify the largest experiment's business impact."],
      model: "demo-evaluator",
      promptVersion: "2.1",
      errorMessage: null,
      createdAt: "2026-08-16T12:00:00.000Z",
      updatedAt: "2026-08-16T12:01:00.000Z",
      completedAt: "2026-08-16T12:01:00.000Z",
    },
    {
      id: ids.evaluations[2],
      userId,
      applicationId: ids.applications[2],
      jobId: ids.jobs[2],
      cvVersionId: ids.cvs[2],
      status: "completed",
      recommendation: "apply",
      overallScore: 89,
      summary: "Excellent product-minded ML fit.",
      strengths: ["LLM product delivery", "Evaluation", "Customer discovery"],
      gaps: ["No named frontend framework"],
      evidence: [],
      suggestedEdits: ["Lead with the shipped LLM workflow and its adoption."],
      model: "demo-evaluator",
      promptVersion: "2.1",
      errorMessage: null,
      createdAt: "2026-08-14T16:00:00.000Z",
      updatedAt: "2026-08-14T16:01:00.000Z",
      completedAt: "2026-08-14T16:01:00.000Z",
    },
  ];

  const applicationEvents: ApplicationEvent[] = [
    createEvent(userId, 0, 0, {
      type: "created",
      title: "Role saved",
      details: null,
      fromStatus: null,
      toStatus: "saved",
      occurredAt: "2026-08-18T08:30:00.000Z",
    }),
    createEvent(userId, 1, 0, {
      type: "evaluation_completed",
      title: "Evaluation completed",
      details: "Evidence fit: 82/100",
      fromStatus: null,
      toStatus: null,
      occurredAt: "2026-08-18T09:01:00.000Z",
    }),
    createEvent(userId, 2, 0, {
      type: "status_changed",
      title: "Application submitted",
      details: null,
      fromStatus: "saved",
      toStatus: "applied",
      occurredAt: "2026-08-18T14:00:00.000Z",
    }),
    createEvent(userId, 3, 0, {
      type: "interview_scheduled",
      title: "Technical interview scheduled",
      details: "Prepare a production deployment story.",
      fromStatus: "screening",
      toStatus: "interview",
      occurredAt: "2026-08-21T07:30:00.000Z",
    }),
    createEvent(userId, 4, 1, {
      type: "status_changed",
      title: "Application submitted",
      details: null,
      fromStatus: "saved",
      toStatus: "applied",
      occurredAt: "2026-08-19T10:00:00.000Z",
    }),
    createEvent(userId, 5, 2, {
      type: "status_changed",
      title: "Recruiter replied",
      details: "Introductory call requested.",
      fromStatus: "applied",
      toStatus: "screening",
      occurredAt: "2026-08-18T12:00:00.000Z",
    }),
    ...[3, 4, 5, 6].map((applicationIndex, offset) =>
      createEvent(userId, 6 + offset, applicationIndex, {
        type: "created",
        title: "Role imported",
        details: null,
        fromStatus: null,
        toStatus: applications[applicationIndex].status,
        occurredAt: applications[applicationIndex].createdAt,
        metadata: { batchId: ids.imports[0] },
      }),
    ),
  ];

  const reminders: Reminder[] = [
    {
      id: ids.reminders[0],
      userId,
      applicationId: ids.applications[0],
      title: "Prepare for Northstar technical interview",
      notes: "Bring one deployment trade-off story and one model-quality example.",
      dueAt: "2026-08-24T09:00:00.000Z",
      status: "pending",
      completedAt: null,
      createdAt: "2026-08-21T07:35:00.000Z",
      updatedAt: "2026-08-21T07:35:00.000Z",
    },
    {
      id: ids.reminders[1],
      userId,
      applicationId: ids.applications[1],
      title: "Follow up with Bright Data",
      notes: null,
      dueAt: "2026-08-26T09:00:00.000Z",
      status: "pending",
      completedAt: null,
      createdAt: "2026-08-19T10:05:00.000Z",
      updatedAt: "2026-08-19T10:05:00.000Z",
    },
  ];

  const importBatches: ImportBatch[] = [
    {
      id: ids.imports[0],
      userId,
      source: "csv",
      fileName: "saved-roles.csv",
      status: "completed",
      totalRows: 4,
      processedRows: 4,
      succeededRows: 4,
      failedRows: 0,
      errors: [],
      createdAt: "2026-08-17T11:55:00.000Z",
      updatedAt: "2026-08-17T12:00:00.000Z",
      completedAt: "2026-08-17T12:00:00.000Z",
    },
  ];

  const automationRules: AutomationRule[] = [
    {
      id: ids.automationRules[0],
      userId,
      type: "auto_evaluate",
      enabled: true,
      config: { minimumDescriptionLength: 40 },
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
    {
      id: ids.automationRules[1],
      userId,
      type: "follow_up",
      enabled: true,
      config: { delayHours: 168 },
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
    {
      id: ids.automationRules[2],
      userId,
      type: "interview_prep",
      enabled: true,
      config: { leadHours: 24 },
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
  ];

  const automationRuns: AutomationRun[] = [
    {
      id: ids.automationRuns[0],
      userId,
      ruleId: ids.automationRules[0],
      applicationId: ids.applications[0],
      type: "auto_evaluate",
      status: "succeeded",
      idempotencyKey: `auto-evaluation:${ids.applications[0]}:${ids.cvs[0]}:seed-v1`,
      errorMessage: null,
      attempts: 1,
      scheduledAt: "2026-08-18T09:00:00.000Z",
      startedAt: "2026-08-18T09:00:00.000Z",
      completedAt: "2026-08-18T09:01:00.000Z",
      createdAt: "2026-08-18T09:00:00.000Z",
      updatedAt: "2026-08-18T09:01:00.000Z",
    },
  ];

  return {
    schemaVersion: DATA_STORE_SCHEMA_VERSION,
    seededAt: SEEDED_AT,
    jobs,
    applications,
    applicationEvents,
    cvVersions,
    evaluations,
    reminders,
    importBatches,
    automationRules,
    automationRuns,
  };
}
