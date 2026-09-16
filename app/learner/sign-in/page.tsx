import '../../lab/lab.css';

export default function LearnerSignInPage() {
  const demo = process.env.LAB_DEMO_STORE === '1';
  return (
    <main className="lab-page">
      <div className="lab-topbar"><span>ocula<span className="brand-period">.</span></span><nav><a href="/">Atlas</a><a href="/lab">Lab latihan</a></nav></div>
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
        <a href="/learner">Lanjut ke penugasanku</a> · <a href="/lab">Latihan bebas</a>
      </p>
    </main>
  );
}
