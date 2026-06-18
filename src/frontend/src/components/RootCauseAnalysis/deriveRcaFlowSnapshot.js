/**
 * Shared snapshot for RCA visuals (flow grid + trace graphic).
 */
export function deriveRcaFlowSnapshot(data, selectedPath, thresholdCrossings = [], scopeState = null, scopePlant = null) {
  if (!data || !data.flow) return null;

  const flow = data.flow;
  const states = flow.state || {};
  const plants = flow.plant || {};
  const assetIds = flow.asset_id || {};
  const rulThresholds = flow.rul_threshold || {};

  const stateKeys = Object.keys(states);
  const plantKeys = Object.keys(plants).sort();
  const assetKeys = Object.keys(assetIds).sort();

  const currentState =
    (selectedPath.state && states[selectedPath.state] != null ? selectedPath.state : null) ||
    (scopeState && states[scopeState] != null ? scopeState : null) ||
    stateKeys[0];

  let currentPlant = selectedPath.plant;
  if (!currentPlant || plants[currentPlant] == null) {
    currentPlant = scopePlant && plants[scopePlant] != null ? scopePlant : plantKeys[0];
  }

  let currentAssetId = selectedPath.asset_id;
  if (!currentAssetId || !assetIds[currentAssetId]) {
    currentAssetId = assetKeys[0];
  }

  const fromAsset = assetIds[currentAssetId]?.rul_threshold;
  const currentRul =
    selectedPath.rul_threshold != null && selectedPath.rul_threshold !== ''
      ? selectedPath.rul_threshold
      : fromAsset;

  const pastEvents = assetIds[currentAssetId]?.past_events || [];
  const assetCrossings = thresholdCrossings.filter((c) => c.asset_id === currentAssetId);
  const allPastEvents = [
    ...pastEvents.map((e) => ({ ...e, source: 'historical' })),
    ...assetCrossings.map((c) => ({
      date: selectedPath.date || '2023-02-20',
      time: c.time,
      type: c.type,
      threshold: c.threshold,
      value: c.value,
      previous: c.previous,
      description: `${c.type === 'vibration' ? 'Vibration' : 'Temperature'} crossed ${c.threshold} threshold`,
      source: 'detected',
    })),
  ].sort((a, b) => {
    const dateCompare = (a.date || '').localeCompare(b.date || '');
    if (dateCompare !== 0) return dateCompare;
    return (a.time || '').localeCompare(b.time || '');
  });

  return {
    total: data.total_assets || 0,
    states,
    plants,
    assetIds,
    rulThresholds,
    currentState,
    currentPlant,
    currentAssetId,
    currentRul,
    rootCauses:
      assetIds[currentAssetId]?.root_causes ||
      (currentRul != null ? rulThresholds[String(currentRul)]?.root_causes : null) ||
      [],
    pastEvents: allPastEvents,
    crossingsForAsset: assetCrossings,
  };
}
