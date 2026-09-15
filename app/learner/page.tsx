import LearnerHome from './LearnerHome';
import '../lab/lab.css';

export default function LearnerPage() {
  const demo = process.env.LAB_DEMO_STORE === '1';
  return <LearnerHome demoMode={demo} />;
}
