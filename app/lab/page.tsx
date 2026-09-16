import { readFile } from 'node:fs/promises';
import path from 'node:path';
import './lab.css';

interface DemoCase {
  caseId: string;
  title: string;
  modality: string;
  tasks: { taskId: string; kind: string }[];
}

async function loadManifest(): Promise<{ releaseId: string; version: string; cases: DemoCase[] } | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), 'public', 'lab-demo', 'public-manifest.json'), 'utf8');
    return JSON.parse(raw) as { releaseId: string; version: string; cases: DemoCase[] };
  } catch {
    return null;
  }
}

export default async function LabHome() {
  const manifest = await loadManifest();
  const demo = process.env.LAB_DEMO_STORE === '1';
  return (
    <main className="lab-page">
      <div className="lab-topbar"><span>ocula<span className="brand-period">.</span></span><nav><a href="/">Atlas</a><a href="/faculty">Fakultas</a></nav></div>
      <p className="lab-eyebrow">OCULA · LAB LATIHAN</p>
      <h1>Latihan interpretasi fundus</h1>
      <p className="lab-note">
        Seluruh kasus di bawah ini <strong>sintetis</strong> (dibuat oleh generator lokal untuk uji alur:
        anotasi → kirim → umpan balik). Bukan citra klinis, bukan data pasien, dan tidak menggantikan 12 kasus
        review yang menjadi target rilis.
      </p>
      {!demo && (
        <p className="lab-note lab-warn" role="status">
          Mode demo lokal belum aktif di server ini. Latihan butuh penyimpanan demo (LAB_DEMO_STORE=1) atau
          database yang dikonfigurasi.
        </p>
      )}
      {!manifest ? (
        <p className="lab-note" role="status">
          Paket demo belum digenerate. Jalankan <code>node scripts/imaging/demo-pack.mjs</code> di repo lalu muat ulang.
        </p>
      ) : (
        <>
          <p className="lab-note">
            Paket <code>{manifest.releaseId}</code> v{manifest.version} · {manifest.cases.length} kasus.
          </p>
          <ol className="lab-list">
            {manifest.cases.map((c, i) => (
              <li key={c.caseId}>
                <a href={`/lab/${c.caseId}`}>
                  <strong>{i + 1}. {c.title}</strong>
                  <span>{c.tasks.map((t) => t.kind).join(' + ')}</span>
                </a>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="lab-note"><a href="/">← Kembali ke atlas</a></p>
    </main>
  );
}
