import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, download, errorMessage, fieldMap } from '../lib/api';
import type { ImportReport, NameCount } from '../lib/types';
import { Banner, PageHead } from '../components/ui';

/** How many problem rows to draw at once; a 571-row file can have hundreds. */
const SHOWN = 200;

const FIELD_LABEL: Record<string, string> = {
  trust_code: 'Trust', inst_code: 'ACM code', inst_reg_code: 'Reg code', inst_full_code: 'Full code',
  regn_code: 'Region', inst_name: 'Name', place_code: 'Place', branch_code: 'Branch', from_fin_yr: 'Start year',
  reg_date: 'Registered on', inst_email: 'Email', inst_head_mobile: 'Head mobile', inst_head_email: 'Head email',
  inst_acnt_mobile: 'Accountant mobile', inst_acnt_email: 'Accountant email', inst_liason_mobile: 'Liaison mobile',
  inst_liason_email: 'Liaison email',
};

/** Institutions from Excel (Form 5): check the file first, then import every ready row in one go. */
export default function InstitutionImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState<'' | 'check' | 'import' | 'template'>('');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);

  function choose(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setReport(null);
    setBanner(null);
    setShowAll(false);
  }

  async function send(dryRun: boolean) {
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    setBusy(dryRun ? 'check' : 'import');
    setBanner(null);
    try {
      const r = await api<ImportReport>(`/api/v1/institutions/import${dryRun ? '?dry_run=true' : ''}`, { method: 'POST', body });
      setReport(r);
      if (!dryRun) {
        setBanner({
          kind: 'ok',
          text: `Imported ${r.imported} ${r.imported === 1 ? 'institution' : 'institutions'}.` +
            (r.skipped ? ` ${r.skipped} with problems were skipped; fix them and upload the same file again.` : ''),
        });
      }
    } catch (e) {
      setReport(null);
      const msg = e instanceof ApiError && e.fields.length ? fieldMap(e.fields).file ?? errorMessage(e) : errorMessage(e);
      setBanner({ kind: 'err', text: msg });
    } finally {
      setBusy('');
    }
  }

  async function template() {
    setBusy('template');
    try {
      await download('/api/v1/institutions/import/template', 'institutions-import-template.xlsx');
    } catch (e) {
      setBanner({ kind: 'err', text: errorMessage(e) });
    } finally {
      setBusy('');
    }
  }

  function confirmImport() {
    if (!report) return;
    if (window.confirm(`Import ${report.ready} ${report.ready === 1 ? 'institution' : 'institutions'}? They cannot be deleted from the app yet.`)) {
      send(false);
    }
  }

  const problems = report ? (showAll ? report.problems : report.problems.slice(0, SHOWN)) : [];

  return (
    <>
      <PageHead title="Import institutions" subtitle="Add many institutions at once from an Excel (.xlsx) file." back={false} />
      {banner && <Banner kind={banner.kind}>{banner.text}</Banner>}

      <section className="card">
        <h2>1. The file</h2>
        <p className="section-note">
          Use the template, or the old system's sheet as it is (its ACM_CODE, ACM_REG_CODE, ACM_INST_NAME, ACM_INST_PLACE,
          ACM_INST_BRANCH and ACM_INST_TRUST columns are understood). Place and branch can be a code or a name from their lists.
        </p>
        <div className="import-row">
          <button type="button" className="btn btn-secondary" onClick={template} disabled={!!busy}>
            {busy === 'template' ? 'Preparing…' : 'Download template'}
          </button>
          <label className="file-pick">
            <span className="sr-only">Excel file</span>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={choose} disabled={!!busy} />
          </label>
          <button type="button" className="btn btn-primary" onClick={() => send(true)} disabled={!file || !!busy}>
            {busy === 'check' ? 'Checking…' : 'Check file'}
          </button>
        </div>
      </section>

      {report && (
        <section className="card">
          <div className="card-head">
            <h2>2. {report.dry_run ? 'What will happen' : 'Result'}</h2>
            {report.dry_run && (
              <button type="button" className="btn btn-primary" onClick={confirmImport} disabled={report.ready === 0 || !!busy}>
                {busy === 'import' ? 'Importing…' : `Import ${report.ready} ${report.ready === 1 ? 'institution' : 'institutions'}`}
              </button>
            )}
          </div>

          <div className="stats">
            <div><strong>{report.total}</strong><span className="muted small">rows in the file</span></div>
            <div className="ok"><strong>{report.dry_run ? report.ready : report.imported}</strong><span className="muted small">{report.dry_run ? 'ready to import' : 'imported'}</span></div>
            <div className={report.problems.length ? 'bad' : ''}><strong>{report.problems.length}</strong><span className="muted small">with problems{report.dry_run ? ', will be skipped' : ', skipped'}</span></div>
          </div>
          {report.default_from_fin_yr && (
            <p className="muted small">Rows without a start year get {report.default_from_fin_yr}, the current year.</p>
          )}
          {!report.dry_run && report.imported > 0 && (
            <p><Link to="/institutions">See the institutions</Link></p>
          )}

          {(report.missing_places.length > 0 || report.missing_branches.length > 0) && (
            <div className="missing">
              <p>
                These names are not in the lists yet. Add them in <Link to="/masters">Places, branches and regions</Link> (or fix
                the spelling in the file), then check the file again.
              </p>
              <div className="missing-lists">
                <MissingList title="Places" list={report.missing_places} />
                <MissingList title="Branches" list={report.missing_branches} />
              </div>
            </div>
          )}

          {report.problems.length > 0 && (
            <>
              <h3>Rows with problems</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Row</th><th>ACM code</th><th className="hide-sm">Name</th><th>Problems</th></tr>
                  </thead>
                  <tbody>
                    {problems.map((p) => (
                      <tr key={p.row}>
                        <td>{p.row}</td>
                        <td className="nowrap">{p.inst_code || '—'}</td>
                        <td className="hide-sm">{p.inst_name || '—'}</td>
                        <td>
                          <ul className="problem-list">
                            {p.errors.map((e, i) => (
                              <li key={i}>{e.field ? <strong>{FIELD_LABEL[e.field] ?? e.field}: </strong> : null}{e.message}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {report.problems.length > SHOWN && !showAll && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAll(true)}>
                  Show all {report.problems.length}
                </button>
              )}
            </>
          )}
        </section>
      )}

      <div className="actions">
        <Link to="/institutions" className="btn btn-secondary">Back to institutions</Link>
      </div>
    </>
  );
}

function MissingList({ title, list }: { title: string; list: NameCount[] }) {
  if (!list.length) return null;
  return (
    <div>
      <h3>{title} ({list.length})</h3>
      <ul>
        {list.map((n) => (
          <li key={n.name}>{n.name} <span className="muted small">· {n.rows} {n.rows === 1 ? 'row' : 'rows'}</span></li>
        ))}
      </ul>
    </div>
  );
}
