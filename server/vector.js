// simple bag-of-words vectorizer and cosine similarity (CommonJS)
function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

function computeVector(text) {
  const tokens = tokenize(text);
  const vec = {};
  tokens.forEach((t) => {
    vec[t] = (vec[t] || 0) + 1;
  });
  const len = Math.sqrt(Object.values(vec).reduce((sum, v) => sum + v * v, 0));
  if (len > 0) {
    Object.keys(vec).forEach((k) => {
      vec[k] = vec[k] / len;
    });
  }
  return vec;
}

function cosine(a, b) {
  let sum = 0;
  for (const k in a) {
    if (b[k]) sum += a[k] * b[k];
  }
  return sum;
}

module.exports = { default: { computeVector, cosine }, computeVector, cosine };
