function sanitizeReading(entityId, currentVal, prevVal, options = {}) {
  const MAX_STEP_CHANGE = 20.0;
  if (prevVal !== null && prevVal !== undefined && Math.abs(currentVal - prevVal) > MAX_STEP_CHANGE) {
    console.warn(`[ETL Guard] Clamping implausible jump on ${entityId}: ${currentVal} -> prev ${prevVal}`);
    return prevVal;
  }
  return currentVal;
}

module.exports = { sanitizeReading };