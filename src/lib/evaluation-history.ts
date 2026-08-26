interface CvLabelItem {
  id: string;
  name: string;
}

export function evaluationCvLabel(
  cvVersionId: string | null,
  availableCvs: CvLabelItem[],
): string {
  if (!cvVersionId) return "deleted CV version";
  return availableCvs.find(cv => cv.id === cvVersionId)?.name ?? "unavailable CV version";
}
