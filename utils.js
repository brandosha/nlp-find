function cosSim(v1, v2) {
  return Math.abs(v1.reduce(function(sum, a, idx) {
    return sum + a * v2[idx];
  }, 0) / (mag(v1) * mag(v2))); // magnitude is 1 for all feature vectors
}

function mag(v) {
  return Math.sqrt(v.reduce(function(sum, val) {
    return sum + val * val;
  }, 0));
}