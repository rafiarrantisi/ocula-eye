import FacultyHome from './FacultyHome';
import '../lab/lab.css';

export default function FacultyPage() {
  const demo = process.env.LAB_DEMO_STORE === '1';
  return <FacultyHome demoMode={demo} />;
}
