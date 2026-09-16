import { notFound } from 'next/navigation';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import LabRunner from './LabRunner';
import '../lab.css';

interface ManifestMedia {
  asset: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
}

interface ManifestTask {
  taskId: string;
  kind: string;
  prompt: string;
  options?: { id: string; text: string }[];
  permittedClasses?: string[];
  roi?: { polygon: number[][] };
  maxMarks?: number;
  allowNotAssessable?: boolean;
}

interface ManifestCase {
  caseId: string;
  title: string;
  modality: string;
  tasks: ManifestTask[];
  media: ManifestMedia[];
}

async function loadCase(caseId: string): Promise<{ releaseId: string; version: string; entry: ManifestCase } | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), 'public', 'lab-demo', 'public-manifest.json'), 'utf8');
    const manifest = JSON.parse(raw) as { releaseId: string; version: string; cases: ManifestCase[] };
    const entry = manifest.cases.find((c) => c.caseId === caseId);
    return entry ? { releaseId: manifest.releaseId, version: manifest.version, entry } : null;
  } catch {
    return null;
  }
}

export async function generateStaticParams(): Promise<{ caseId: string }[]> {
  try {
    const raw = await readFile(path.join(process.cwd(), 'public', 'lab-demo', 'public-manifest.json'), 'utf8');
    const manifest = JSON.parse(raw) as { cases?: { caseId?: unknown }[] };
    if (!Array.isArray(manifest.cases)) return [];
    return manifest.cases
      .filter((c) => typeof c?.caseId === 'string')
      .map((c) => ({ caseId: c.caseId as string }));
  } catch {
    return [];
  }
}

export default async function LabCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const loaded = await loadCase(caseId);
  if (!loaded) notFound();
  const demo = process.env.LAB_DEMO_STORE === '1';
  return (
    <LabRunner
      releaseId={loaded.releaseId}
      releaseVersion={loaded.version}
      caseEntry={loaded.entry}
      demoMode={demo}
    />
  );
}
