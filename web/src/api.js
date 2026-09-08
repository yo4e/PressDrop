async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `PressDrop API request failed (${response.status})`);
    error.data = payload?.error ?? { code: "API_ERROR", message: error.message };
    throw error;
  }
  return payload;
}

export const pressDropApi = {
  inspect(bundleDir) {
    return request("/api/inspect", { method: "POST", body: JSON.stringify({ bundleDir }) });
  },
  preflight({ bundleDir, profilePath, username, applicationPassword }) {
    return request("/api/preflight", {
      method: "POST",
      body: JSON.stringify({ bundleDir, profilePath, username, applicationPassword }),
    });
  },
  startSubmission({ bundleDir, profilePath, username, applicationPassword, expectedSourceFingerprint }) {
    return request("/api/submissions", {
      method: "POST",
      body: JSON.stringify({ bundleDir, profilePath, username, applicationPassword, expectedSourceFingerprint }),
    });
  },
  getSubmission(jobId) {
    return request(`/api/submissions/${encodeURIComponent(jobId)}`);
  },
};
