import { FileText } from "lucide-react";
import { CvLibrary, type CvLibraryItemDto } from "@/components/cv-library";
import { CvUploader, ManualCvForm } from "@/components/cv-manager";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { scanCvForAts } from "@/lib/cv-artifacts";
import { getDataRepository } from "@/lib/data";

export const metadata = { title: "CV library" };

export default async function CvsPage() {
  const user = await requireUser();
  const repository = await getDataRepository({ userId: user.id });
  const cvs = await repository.listCvVersions();
  const libraryItems: CvLibraryItemDto[] = cvs.map((cv) => ({
    id: cv.id,
    name: cv.name,
    fileName: cv.fileName,
    mimeType: cv.mimeType,
    isDefault: cv.isDefault,
    createdAt: cv.createdAt,
    hasPdfPreview: cv.mimeType === "application/pdf" && Boolean(cv.storagePath),
    atsReport: scanCvForAts({
      content: cv.content,
      fileName: cv.fileName,
      mimeType: cv.mimeType,
    }),
  }));

  return (
    <main className="page">
      <PageHeader
        eyebrow="Versioned evidence"
        title="CV library"
        description="Upload, select, inspect, ATS-check, or delete CVs preserved as canonical Markdown."
        actions={<CvUploader />}
      />
      <div className="splitGrid">
        <section className="panel">
          <div className="panelHeader">
            <div>
              <h2>Your CV versions</h2>
              <p>Your selected CV is used for future choices; existing attachments stay unchanged.</p>
            </div>
            <Badge tone="green">{cvs.length} versions</Badge>
          </div>
          <div className="panelBody">
            {libraryItems.length ? (
              <CvLibrary cvs={libraryItems} />
            ) : (
              <EmptyState
                icon={<FileText />}
                title="No CVs yet"
                description="Import the first version to start evaluating roles."
              />
            )}
          </div>
        </section>
        <aside className="panel">
          <div className="panelHeader">
            <div>
              <h2>Paste extracted text</h2>
              <p>Useful when a PDF has unusual formatting.</p>
            </div>
          </div>
          <div className="panelBody"><ManualCvForm /></div>
        </aside>
      </div>
    </main>
  );
}
