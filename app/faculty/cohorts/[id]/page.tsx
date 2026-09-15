import CohortDetail from './CohortDetail';
import '../../../lab/lab.css';

export default async function FacultyCohortPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CohortDetail cohortId={id} />;
}
