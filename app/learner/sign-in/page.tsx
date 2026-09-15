import Link from 'next/link';
import '../../lab/lab.css';

export default function LearnerSignInPage() {
  const demo = process.env.LAB_DEMO_STORE === '1';
  return (
    <main className="lab-page">
      <p className="lab-eyebrow">OCULA · MASUK PESERTA</p>
      <h1>Masuk</h1>
      {demo ? (
        <p className="lab-note">
          Mode demo lokal: sesi anonim dibuat otomatis saat membuka halaman penugasan. Tidak ada kata sandi,
          tidak ada data pribadi.
        </p>
      ) : (
        <p className="lab-note lab-warn" role="status">
          Masuk memakai auth institusi yang dikelola (belum dikonfigurasi di deployment ini).
        </p>
      )}
      <p className="lab-note">
        <Link href="/learner">Lanjut ke penugasanku</Link> · <Link href="/lab">Latihan bebas</Link>
      </p>
    </main>
  );
}
