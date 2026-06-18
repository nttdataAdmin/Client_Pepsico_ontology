import React, { useMemo, useState, useCallback } from 'react';
import { buildFl5883ExtractedPayload, flattenPayloadForTable } from '../../utils/buildFl5883ExtractedPayload';
import './ExecutiveExtractedTabs.css';

const TAB_GATE = 'gate';
const TAB_JSON = 'json';
const TAB_TABULAR = 'tabular';

export default function ExecutiveExtractedTabs({
  children,
  imageSrc,
  imageFileName,
  classification,
  formClassifyMeta,
}) {
  const [tab, setTab] = useState(TAB_GATE);
  const [copyFlash, setCopyFlash] = useState(false);

  const payload = useMemo(
    () =>
      buildFl5883ExtractedPayload({
        scanKey: formClassifyMeta?.fl5883_scan_key ?? null,
        classification: classification === 'no_go' ? 'no_go' : 'go',
        sourceFilename: formClassifyMeta?.source_filename || imageFileName || '',
        formClassifyMeta,
      }),
    [classification, formClassifyMeta, imageFileName]
  );

  const jsonText = useMemo(() => JSON.stringify(payload, null, 2), [payload]);
  const tableRows = useMemo(() => flattenPayloadForTable(payload), [payload]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopyFlash(true);
      setTimeout(() => setCopyFlash(false), 1600);
    } catch {
      /* ignore */
    }
  }, [jsonText]);

  return (
    <section className="es-extracted-panel card" aria-label="Extracted information">
      <header className="es-eit-header">
        <h2 className="es-eit-title">Extracted information</h2>
        <p className="es-eit-subtitle">Form capture, release gate narrative, and machine-readable payload on one screen.</p>
      </header>

      <div className="es-eit-tablist" role="tablist" aria-label="Extracted information views">
        <button
          type="button"
          role="tab"
          id="es-eit-tab-gate"
          aria-selected={tab === TAB_GATE}
          aria-controls="es-eit-panel-gate"
          className={`es-eit-tab ${tab === TAB_GATE ? 'es-eit-tab--active' : ''}`}
          onClick={() => setTab(TAB_GATE)}
        >
          Process parameter gate
        </button>
        <button
          type="button"
          role="tab"
          id="es-eit-tab-json"
          aria-selected={tab === TAB_JSON}
          aria-controls="es-eit-panel-json"
          className={`es-eit-tab ${tab === TAB_JSON ? 'es-eit-tab--active' : ''}`}
          onClick={() => setTab(TAB_JSON)}
        >
          Raw JSON
        </button>
        <button
          type="button"
          role="tab"
          id="es-eit-tab-tabular"
          aria-selected={tab === TAB_TABULAR}
          aria-controls="es-eit-panel-tabular"
          className={`es-eit-tab ${tab === TAB_TABULAR ? 'es-eit-tab--active' : ''}`}
          onClick={() => setTab(TAB_TABULAR)}
        >
          Tabular view
        </button>
      </div>

      <div
        id="es-eit-panel-gate"
        role="tabpanel"
        aria-labelledby="es-eit-tab-gate"
        hidden={tab !== TAB_GATE}
        className="es-eit-panel es-eit-panel--gate"
      >
        <div className="es-eit-scan" aria-label="Original upload">
          <div className="es-eit-scan-label">Original (uploaded)</div>
          <div className="es-eit-scan-frame">
            {imageSrc ? (
              <img
                src={imageSrc}
                alt={`Uploaded QC form: ${imageFileName || 'scan'}`}
                className="es-eit-scan-img"
              />
            ) : (
              <div className="es-eit-scan-placeholder">
                No preview available — re-upload the form to attach the scan.
              </div>
            )}
          </div>
        </div>
        <div className="es-eit-gate-narrative">{children}</div>
      </div>

      <div
        id="es-eit-panel-json"
        role="tabpanel"
        aria-labelledby="es-eit-tab-json"
        hidden={tab !== TAB_JSON}
        className="es-eit-panel es-eit-panel--data"
      >
        <div className="es-eit-data-toolbar">
          <button type="button" className="es-eit-btn es-eit-btn--gold" onClick={handleCopy}>
            {copyFlash ? 'Copied' : 'Copy JSON'}
          </button>
          <button type="button" className="es-eit-btn es-eit-btn--teal" disabled title="Read-only in this demo">
            Edit
          </button>
        </div>
        <pre className="es-eit-json" tabIndex={0}>
          {jsonText}
        </pre>
      </div>

      <div
        id="es-eit-panel-tabular"
        role="tabpanel"
        aria-labelledby="es-eit-tab-tabular"
        hidden={tab !== TAB_TABULAR}
        className="es-eit-panel es-eit-panel--data"
      >
        <div className="es-eit-table-wrap">
          <table className="es-eit-table">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.path}>
                  <td className="es-eit-td-path">{row.path}</td>
                  <td className="es-eit-td-val">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
