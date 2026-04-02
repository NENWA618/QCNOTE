export function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

export function computeVector(text: string) {
  const tokens = tokenize(text);
  const vec: Record<string, number> = {};
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

export function cosine(a: Record<string, number>, b: Record<string, number>) {
  let sum = 0;
  for (const k in a) {
    if (b[k]) sum += a[k] * b[k];
  }
  return sum;
}

export default { computeVector, cosine };
