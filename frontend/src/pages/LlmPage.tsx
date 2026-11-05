import { useMemo, useState, type FormEvent } from 'react';
import {
  Box,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Database,
  Download,
  Folder,
  Gauge,
  Info,
  Layers,
  Link as LinkIcon,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Page } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Button, IconButton, Pill, ProgressBar } from '../components/ui/Primitives';
import { useNotice } from '../components/ui/Notice';
import { dataService } from '../services/dataService';
import { formatDateTime, formatNumber, percentOf } from '../lib/format';
import type { LlmModel } from '../types/models';

type SortDir = 'none' | 'asc' | 'desc';

export function LlmPage() {
  const { notAvailable, notify } = useNotice();
  const models = dataService.getLlmModels();
  const targetDirs = dataService.getLlmTargetDirectories();
  const downloads = dataService.getLlmDownloads();

  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [quant, setQuant] = useState('');
  const [sort, setSort] = useState<SortDir>('none');
  const [infoModel, setInfoModel] = useState<LlmModel | null>(null);
  const [url, setUrl] = useState('');
  const [targetDir, setTargetDir] = useState(targetDirs[0] ?? '');

  const types = useMemo(() => [...new Set(models.map((m) => m.type))], [models]);
  const quants = useMemo(() => [...new Set(models.map((m) => m.quantization))].sort(), [models]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = models.filter(
      (m) =>
        (!q || `${m.fileName} ${m.family} ${m.variant}`.toLowerCase().includes(q)) &&
        (!type || m.type === type) &&
        (!quant || m.quantization === quant),
    );
    if (sort === 'none') return list;
    return [...list].sort((a, b) => a.fileName.localeCompare(b.fileName, 'de', { sensitivity: 'base' }) * (sort === 'asc' ? 1 : -1));
  }, [models, query, type, quant, sort]);

  const nextSort: Record<SortDir, SortDir> = { none: 'asc', asc: 'desc', desc: 'none' };
  const SortIcon = sort === 'asc' ? ChevronUp : sort === 'desc' ? ChevronDown : ChevronsUpDown;

  const onDownload = (e: FormEvent) => {
    e.preventDefault();
    notAvailable('Download starten');
  };

  return (
    <Page
      title="LLM"
      subtitle="Lokale Sprachmodelle verwalten, herunterladen und auf Odin bereitstellen."
      icon={<Layers size={44} strokeWidth={1.6} />}
      className="llm-page"
    >
      <Card
        title={
          <>
            Installierte LLMs <Pill tone="violet">Odin</Pill>
          </>
        }
        icon={<Database size={30} />}
      >
        <div className="toolbar">
          <label className="field field--compact toolbar__search">
            <span className="visually-hidden">Modell suchen</span>
            <Search className="field__icon" size={22} aria-hidden />
            <input className="field__input" type="search" placeholder="Modell suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="select">
            <span className="visually-hidden">Typ filtern</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Alle Typen</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <ChevronDown size={20} className="select__chevron" aria-hidden />
          </label>
          <label className="select">
            <span className="visually-hidden">Quantisierung filtern</span>
            <select value={quant} onChange={(e) => setQuant(e.target.value)}>
              <option value="">Alle Quantisierungen</option>
              {quants.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
            <ChevronDown size={20} className="select__chevron" aria-hidden />
          </label>
          <IconButton label="Liste aktualisieren" className="toolbar__refresh" onClick={() => notify('Demo-Daten – es wurde keine Verbindung zu Odin aufgebaut.')}>
            <RefreshCw size={22} />
          </IconButton>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : 'none'}>
                  <button type="button" className="th-sort" onClick={() => setSort(nextSort[sort])}>
                    Modell <SortIcon size={16} />
                  </button>
                </th>
                <th>Typ</th>
                <th>Größe</th>
                <th>Quantisierung</th>
                <th>Geändert</th>
                <th className="data-table__actions">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="model-cell">
                      <Box size={30} strokeWidth={1.5} className="accent-icon" />
                      <div>
                        <strong>{m.fileName}</strong>
                        <span>
                          {m.family} · {m.parameters} · {m.variant}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Pill tone="neutral">{m.type}</Pill>
                  </td>
                  <td className="nowrap">{formatNumber(m.sizeGb, 1, 1)} GB</td>
                  <td>
                    <Pill tone="quant">{m.quantization}</Pill>
                  </td>
                  <td className="nowrap">{formatDateTime(m.modifiedAt)}</td>
                  <td className="data-table__actions">
                    <div className="row-actions">
                      <IconButton label={`Info zu ${m.fileName}`} onClick={() => setInfoModel(m)}>
                        <Info size={20} />
                      </IconButton>
                      <IconButton label={`${m.fileName} löschen`} tone="danger" onClick={() => notAvailable('Modell löschen')}>
                        <Trash2 size={20} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="data-table__empty">
                    Keine Modelle gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Neues LLM herunterladen"
        subtitle={`Ein Sprachmodell per Download-Link direkt auf Odin (${targetDirs[0] ?? '/models'}) herunterladen.`}
        icon={<Download size={36} />}
      >
        <form className="download-form" onSubmit={onDownload}>
          <label className="download-form__url">
            <span className="form-label">Download-Link (direkte Datei-URL)</span>
            <span className="field field--compact">
              <LinkIcon className="field__icon" size={22} aria-hidden />
              <input className="field__input" type="url" placeholder="https:// … /modell.gguf" value={url} onChange={(e) => setUrl(e.target.value)} />
            </span>
          </label>
          <label className="download-form__dir">
            <span className="form-label">Zielverzeichnis (Odin)</span>
            <span className="select select--icon">
              <Folder size={22} className="select__icon" aria-hidden />
              <select value={targetDir} onChange={(e) => setTargetDir(e.target.value)}>
                {targetDirs.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <ChevronDown size={20} className="select__chevron" aria-hidden />
            </span>
          </label>
          <Button type="submit" icon={<Download size={22} />} className="download-form__submit">
            Download starten
          </Button>
        </form>

        {downloads.map((d) => {
          const pct = percentOf(d.downloadedGb, d.totalGb);
          return (
            <div key={d.fileName} className="download-item">
              <Download size={30} className="accent-icon" />
              <div className="download-item__main">
                <div className="download-item__row">
                  <div>
                    <strong>{d.fileName}</strong>
                    <span>Download läuft …</span>
                  </div>
                  <span className="download-item__size">
                    {formatNumber(d.downloadedGb, 1, 1)} GB / {formatNumber(d.totalGb, 1, 1)} GB ({pct} %)
                  </span>
                </div>
                <ProgressBar value={pct} tone="violet" label={`Download ${d.fileName}`} />
              </div>
              <span className="download-item__speed">
                <Gauge size={22} /> {d.speedMbS} MB/s
              </span>
              <IconButton label="Download abbrechen" onClick={() => notAvailable('Download abbrechen')}>
                <X size={22} />
              </IconButton>
            </div>
          );
        })}
      </Card>

      <Modal open={infoModel !== null} onClose={() => setInfoModel(null)} title="Modellinformationen" icon={<Info size={22} />}>
        {infoModel && (
          <dl className="info-list">
            <div>
              <dt>Datei</dt>
              <dd>{infoModel.fileName}</dd>
            </div>
            <div>
              <dt>Pfad (Odin)</dt>
              <dd>{infoModel.path}</dd>
            </div>
            <div>
              <dt>Modellfamilie</dt>
              <dd>{infoModel.family}</dd>
            </div>
            <div>
              <dt>Parameter</dt>
              <dd>{infoModel.parameters}</dd>
            </div>
            <div>
              <dt>Variante</dt>
              <dd>{infoModel.variant}</dd>
            </div>
            <div>
              <dt>Typ</dt>
              <dd>{infoModel.type}</dd>
            </div>
            <div>
              <dt>Größe</dt>
              <dd>{formatNumber(infoModel.sizeGb, 1, 1)} GB</dd>
            </div>
            <div>
              <dt>Quantisierung</dt>
              <dd>{infoModel.quantization}</dd>
            </div>
            <div>
              <dt>Geändert</dt>
              <dd>{formatDateTime(infoModel.modifiedAt)}</dd>
            </div>
            <div>
              <dt>Open WebUI</dt>
              <dd>{infoModel.availableInOpenWebUi ? 'verfügbar' : 'nicht verfügbar'}</dd>
            </div>
          </dl>
        )}
      </Modal>
    </Page>
  );
}
