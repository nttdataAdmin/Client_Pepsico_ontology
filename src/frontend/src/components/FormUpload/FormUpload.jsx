import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { classifyForm } from '../../services/api';
import { useAppFlow } from '../../context/AppFlowContext';
import { operatorRoleTitle } from '../../utils/operatorRole';
import FormProcessingOverlay from './FormProcessingOverlay';
import {
  inferDemoOutcomeFromFilename,
  inferFl5883ScanKey,
  getAmbiguousScanTailLines,
  getClassifierEchoLines,
  getFl5883JobAidScanLines,
  getOutcomeFieldLines,
  getSharedFormFieldLines,
  getStepSidecarLines,
  getWaitingLines,
} from './extractionLogTemplates';
import './FormUpload.css';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatLogTime() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Per-line pause so the console reads like live OCR, not a post-batch dump. */
const FIELD_LINE_MS = 360;
const STEP_SIDE_MS = 85;
const BETWEEN_STEP_MS = 420;

function lineDelayJitter() {
  return Math.floor(Math.random() * 140);
}

export default function FormUpload({ onLogout }) {
  const navigate = useNavigate();
  const { flow, setFlow, loadExcel, setUploadPreview } = useAppFlow();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [procStep, setProcStep] = useState(0);
  const [waitingApi, setWaitingApi] = useState(false);
  const [procLogs, setProcLogs] = useState([]);

  const runPipeline = useCallback(
    async (file, clientHint) => {
      const operatorRole = flow.operatorRole;
      if (!operatorRole) {
        setErr('Your account is missing a line lens. Sign out and sign in with a demo line or supervisor account.');
        return;
      }
      setErr(null);
      setBusy(true);
      setProcessing(true);
      setWaitingApi(false);
      setProcStep(0);
      setProcLogs([]);

      const pushLog = (text) => {
        setProcLogs((prev) => [...prev, `${formatLogTime()}  ${text}`]);
      };

      const streamLines = async (lines, delayMs) => {
        for (let i = 0; i < lines.length; i += 1) {
          pushLog(lines[i]);
          if (delayMs > 0) await sleep(delayMs + lineDelayJitter());
        }
      };

      const apiPromise = classifyForm(file, clientHint);
      const filenameGuess = inferDemoOutcomeFromFilename(file.name);
      const scanKey = inferFl5883ScanKey(file.name);

      try {
        setProcStep(0);
        await streamLines(getStepSidecarLines('mfg'), STEP_SIDE_MS);
        await sleep(BETWEEN_STEP_MS);

        setProcStep(1);
        await streamLines(getStepSidecarLines('load'), STEP_SIDE_MS);
        await sleep(BETWEEN_STEP_MS);

        setProcStep(2);
        await streamLines(getStepSidecarLines('extract'), STEP_SIDE_MS);
        if (scanKey) {
          await streamLines(getFl5883JobAidScanLines(scanKey, operatorRole), FIELD_LINE_MS);
        } else {
          await streamLines(getSharedFormFieldLines(operatorRole), FIELD_LINE_MS);
          if (filenameGuess) {
            await streamLines(getOutcomeFieldLines(filenameGuess, operatorRole), FIELD_LINE_MS);
          } else {
            await streamLines(getAmbiguousScanTailLines(), FIELD_LINE_MS);
          }
        }
        await sleep(BETWEEN_STEP_MS);

        setProcStep(3);
        await streamLines(getStepSidecarLines('classify'), STEP_SIDE_MS);
        await sleep(BETWEEN_STEP_MS);

        setWaitingApi(true);
        pushLog('[NET] POST /api/forms/classify · multipart stream open');
        let hop = 0;
        const pool = getWaitingLines();
        const hopTimer = setInterval(() => {
          hop += 1;
          if (hop > 12) return;
          pushLog(pool[hop % pool.length]);
        }, 680);
        let res;
        try {
          res = await apiPromise;
        } finally {
          clearInterval(hopTimer);
        }
        pushLog('[NET] Response received · normalizing classifier payload');
        await streamLines(getClassifierEchoLines(res, filenameGuess), 280);
        if (!filenameGuess && !scanKey) {
          await streamLines(getOutcomeFieldLines(res.classification, operatorRole), FIELD_LINE_MS);
        } else if (filenameGuess && filenameGuess !== res.classification) {
          pushLog('[CORRECTION] Server outcome differs from filename hint — re-streaming fields for server path');
          if (scanKey) {
            const fixKey = res.classification === 'no_go' ? 'nogo' : 'go';
            await streamLines(getFl5883JobAidScanLines(fixKey, operatorRole), FIELD_LINE_MS);
          } else {
            await streamLines(getOutcomeFieldLines(res.classification, operatorRole), FIELD_LINE_MS);
          }
        }
        await sleep(650);
        setWaitingApi(false);
        setProcessing(false);

        const isNoGo = res.classification === 'no_go';
        await loadExcel(true);

        setUploadPreview(file);

        const formClassifyMeta = {
          classification: res.classification,
          method: res.method,
          confidence: res.confidence,
          breakdown: Array.isArray(res.breakdown) ? res.breakdown : [],
          details: res.details && typeof res.details === 'object' ? res.details : {},
          extraction_summary: typeof res.extraction_summary === 'string' ? res.extraction_summary : '',
          why_no_go: typeof res.why_no_go === 'string' ? res.why_no_go : '',
          source_filename: file.name || '',
          fl5883_scan_key: scanKey || null,
        };

        if (isNoGo) {
          setFlow((prev) => ({
            ...prev,
            outcome: 'no_go',
            operatorRole,
            hitlApproved: false,
            detailedAnalysisUnlocked: false,
            formClassifyMeta,
          }));
          navigate('/executive-summary', { replace: true });
        } else {
          setFlow((prev) => ({
            ...prev,
            outcome: 'go',
            operatorRole,
            hitlApproved: false,
            detailedAnalysisUnlocked: false,
            formClassifyMeta,
          }));
          navigate('/executive-summary', { replace: true });
        }
      } catch (e) {
        setWaitingApi(false);
        setProcessing(false);
        setProcLogs([]);
        setErr(e.message || 'Upload failed');
      } finally {
        setBusy(false);
      }
    },
    [flow.operatorRole, loadExcel, navigate, setFlow, setUploadPreview]
  );

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (f) runPipeline(f, null);
    e.target.value = '';
  };

  return (
    <div className="form-upload-page">
      <FormProcessingOverlay
        active={processing}
        currentStepIndex={procStep}
        waitingOnApi={waitingApi}
        logLines={procLogs}
      />

      <div className="form-upload-card">
        <h1 className="form-upload-title">Package quality form</h1>
        <p className="form-upload-lead">
          Your <strong>processing vs packaging lens</strong> is set from login (master user table). Upload a JOB AID
          (FL-5883 style); the demo classifies <strong>Go</strong> vs <strong>No-Go</strong>. <strong>Go</strong> opens a
          lightweight executive snapshot. <strong>No-Go</strong> requires <strong>supervisor HITL</strong>, then a
          recommendations popup; use <strong>Enter detailed analysis</strong> on Executive summary to unlock the full
          five-tab workspace.
        </p>

        {flow.operatorRole ? (
          <p className="form-upload-lens-note" role="status">
            Signed-in lens: <strong>{operatorRoleTitle(flow.operatorRole)}</strong>
          </p>
        ) : null}

        <label className="form-upload-drop">
          <input type="file" accept="image/*,.pdf,.svg" disabled={busy} onChange={onFile} />
          <span>{busy ? 'Processing…' : 'Choose file or drop here'}</span>
        </label>

        {err ? (
          <div className="form-upload-error" role="alert">
            <strong className="form-upload-error-title">Something went wrong</strong>
            <ul className="form-upload-error-list">
              {String(err)
                .split(/\n+/)
                .map((s) => s.trim())
                .filter(Boolean)
                .map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
