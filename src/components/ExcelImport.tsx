import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, download, errorMessage, fieldMap } from '../lib/api';
import type { ExcelImportReport, NameCount } from '../lib/types';
import { Banner, PageHead } from './ui';

/** How many problem rows to draw at once. */
const SHOWN = 200;

export interface ExcelImportProps {
  title: string;
  subtitle: string;
  /** API path without /import, e.g. /api/v1/stock/items */
  base: string;
  singular: string;
  plural: string;
  templateName: string;
  /** What the file should look like. */
  note: ReactNode;
  keyLabel: string;
  fieldLabels: Record<string, string>;
  /** Per missing column: its title and where its list is kept. */
  missing: Record<string, { title: string; to: string; place: string }>;
  back: { to: string; label: string };
}

/** Check an Excel file first, then import every ready row in one go. */
export function ExcelImport(p: ExcelImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ExcelImportReport | null>(null);
  const [busy, setBusy] = useState<'' | 'check' | 'import' | 'template'>('');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const count = (n: number) => `${n} ${n === 1 ? p.singular : p.plural}`;

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
      const r = await api<ExcelImportReport>(`${p.base}/import${dryRun ? '?dry_run=true' : ''}`, { method: 'POST', body });
      setReport(r);
      if (!dryRun) {
        setBanner({
          kind: 'ok',
          text: `Imported ${count(r.imported)}.` + (r.skipped ? ` ${r.skipped} with problems were skipped; fix them and upload the same file again.` : ''),
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
      await download(`${p.base}/import/template`, p.templateName);
    } catch (e) {
      setBanner({ kind: 'err', text: errorMessage(e) });
    } finally {
      setBusy('');
    }
  }

  function confirmImport() {
    if (report && window.confirm(`Import ${count(report.ready)}?`)) send(false);
  }

  const problems = report ? (showAll ? report.problems : report.problems.slice(0, SHOWN)) : [];
  const missing = report ? Object.entries(report.missing ?? {}).filter(([, list]) => list.length > 0) : [];

  return (
    <>
      <PageHead title={p.title} subtitle={p.subtitle} back={false} />
      {banner && <Banner kind={banner.kind}>{banner.text}</Banner>}

      <section className="card">
        <h2>1. The file</h2>
        <p className="section-note">{p.note}</p>
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
                {busy === 'import' ? 'Importing…' : `Import ${count(report.ready)}`}
              </button>
            )}
          </div>

          <div className="stats">
            <div><strong>{report.total}</strong><span className="muted small">rows in the file</span></div>
            <div className="ok"><strong>{report.dry_run ? report.ready : report.imported}</strong><span className="muted small">{report.dry_run ? 'ready to import' : 'imported'}</span></div>
            <div className={report.problems.length ? 'bad' : ''}><strong>{report.problems.length}</strong><span className="muted small">with problems{report.dry_run ? ', will be skipped' : ', skipped'}</span></div>
          </div>
          {!report.dry_run && report.imported > 0 && <p><Link to={p.back.to}>{p.back.label}</Link></p>}

          {missing.length > 0 && (
            <div className="missing">
              <p>These names are not in their lists yet. Add them (or fix the spelling in the file), then check the file again.</p>
              <div className="missing-lists">
                {missing.map(([col, list]) => {
                  const m = p.missing[col] ?? { title: col, to: p.back.to, place: '' };
                  return <MissingList key={col} title={m.title} to={m.to} place={m.place} list={list} />;
                })}
              </div>
            </div>
          )}

          {report.problems.length > 0 && (
            <>
              <h3>Rows with problems</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Row</th><th>{p.keyLabel}</th><th className="hide-sm">Name</th><th>Problems</th></tr>
                  </thead>
                  <tbody>
                    {problems.map((pr) => (
                      <tr key={pr.row}>
                        <td>{pr.row}</td>
                        <td className="nowrap">{pr.key || '—'}</td>
                        <td className="hide-sm">{pr.name || '—'}</td>
                        <td>
                          <ul className="problem-list">
                            {pr.errors.map((e, i) => (
                              <li key={i}>{e.field ? <strong>{p.fieldLabels[e.field] ?? e.field}: </strong> : null}{e.message}</li>
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
        <Link to={p.back.to} className="btn btn-secondary">{p.back.label}</Link>
      </div>
    </>
  );
}

function MissingList({ title, to, place, list }: { title: string; to: string; place: string; list: NameCount[] }) {
  return (
    <div>
      <h3>{title} ({list.length})</h3>
      {place && <p className="muted small">Add them in <Link to={to}>{place}</Link>.</p>}
      <ul>
        {list.map((n) => (
          <li key={n.name}>{n.name} <span className="muted small">· {n.rows} {n.rows === 1 ? 'row' : 'rows'}</span></li>
        ))}
      </ul>
    </div>
  );
}

/** Downloads a list as .xlsx in the import layout. */
export function ExportButton({ path, filename, disabled }: { path: string; filename: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await download(path, filename);
    } catch (e) {
      window.alert(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={run} disabled={busy || disabled}>
      {busy ? 'Exporting…' : 'Export to Excel'}
    </button>
  );
}
