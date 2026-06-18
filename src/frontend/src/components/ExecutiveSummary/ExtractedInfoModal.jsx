import React, { useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { buildFl5883ExtractedPayload, flattenPayloadForTable } from '../../utils/buildFl5883ExtractedPayload';
import './ExtractedInfoModal.css';

export default function ExtractedInfoModal({
  open,
  onClose,
  imageSrc,
  imageFileName,
  classification,
  formClassifyMeta,
}) {
  const [tab, setTab] = useState('json');
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

  if (!open) return null;

  const modal = (
    <div className="eim-backdrop" role="presentation" onClick={onClose}>
      <div
        className="eim-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eim-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="eim-header">
          <div className="eim-header-text">
            <h2 id="eim-title" className="eim-title">
              Extracted Information
            </h2>
          </div>
          <button type="button" className="eim-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="eim-body">
          <section className="eim-col eim-col--doc" aria-label="Original upload">
            <div className="eim-col-head">Original (uploaded)</div>
            <div className="eim-doc-frame">
              {imageSrc ? (
                <img src={imageSrc} alt={`Uploaded QC form: ${imageFileName || 'scan'}`} className="eim-doc-img" />
              ) : (
                <div className="eim-doc-placeholder">No preview available — re-upload the form to attach the scan.</div>
              )}
            </div>
          </section>

          <section className="eim-col eim-col--data" aria-label="Extracted data">
            <div className="eim-col-head">Extracted Data (JSON)</div>
            <div className="eim-toolbar">
              <button type="button" className="eim-btn eim-btn--gold" onClick={handleCopy}>
                {copyFlash ? 'Copied' : 'Copy JSON'}
              </button>
              <button type="button" className="eim-btn eim-btn--teal" disabled title="Read-only in this demo">
                Edit
              </button>
            </div>
            <div className="eim-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'json'}
                className={`eim-tab ${tab === 'json' ? 'eim-tab--active' : ''}`}
                onClick={() => setTab('json')}
              >
                Raw JSON
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'tabular'}
                className={`eim-tab ${tab === 'tabular' ? 'eim-tab--active' : ''}`}
                onClick={() => setTab('tabular')}
              >
                Tabular View
              </button>
            </div>
            {tab === 'json' ? (
              <pre className="eim-json" tabIndex={0}>
                {jsonText}
              </pre>
            ) : (
              <div className="eim-table-wrap">
                <table className="eim-table">
                  <thead>
                    <tr>
                      <th scope="col">Field</th>
                      <th scope="col">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={row.path}>
                        <td className="eim-td-path">{row.path}</td>
                        <td className="eim-td-val">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
