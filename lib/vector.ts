// simple bag-of-words vectorizer and cosine similarity

export interface Vector {
  [term: string]: number;
}

// tokenize by non-word characters, lowercase
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

export function computeVector(text: string): Vector {
  const tokens = tokenize(text);
  const vec: Vector = {};
  tokens.forEach((t) => {
    vec[t] = (vec[t] || 0) + 1;
  });
  // normalize by length
  const len = Math.sqrt(Object.values(vec).reduce((sum, v) => sum + v * v, 0));
  if (len > 0) {
    Object.keys(vec).forEach((k) => {
      vec[k] = vec[k] / len;
    });
  }
  return vec;
}

export function cosine(a: Vector, b: Vector): number {
  let sum = 0;
  for (const k in a) {
    if (b[k]) sum += a[k] * b[k];
  }
  return sum; // vectors assumed normalized
}

const VectorUtil = { computeVector, cosine };

export default VectorUtil;