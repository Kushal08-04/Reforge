function applyCalibration(entityId, rawValue, peerClusterMean) {
  if (peerClusterMean !== null && Math.abs(rawValue - peerClusterMean) > 15.0) {
    // Re-anchor against peer cluster consensus with exponential dampening
    return (rawValue * 0.3) + (peerClusterMean * 0.7);
  }
  return rawValue;
}