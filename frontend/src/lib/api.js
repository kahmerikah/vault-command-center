import axios from "axios";
import { useVaultStore } from "../store/useVaultStore";

const api = axios.create({
  baseURL: "/api/v1",
});

let refreshInFlight = null;

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export async function refreshSession(refreshToken) {
  if (!refreshToken) {
    throw new Error("missing refresh token");
  }

  if (!refreshInFlight) {
    refreshInFlight = api
      .post(
        "/auth/refresh",
        {},
        {
          headers: {
            Authorization: `Bearer ${refreshToken}`,
          },
        }
      )
      .then((response) => response.data?.data)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;

    if (status !== 401 || originalRequest._retry || String(originalRequest.url || "").includes("/auth/")) {
      return Promise.reject(error);
    }

    const state = useVaultStore.getState();
    if (!state.refreshToken) {
      state.clearAuth();
      setAuthToken("");
      return Promise.reject(error);
    }

    try {
      originalRequest._retry = true;
      const refreshed = await refreshSession(state.refreshToken);
      state.setAuth({
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || state.refreshToken,
        user: refreshed.user || state.user,
      });
      setAuthToken(refreshed.access_token);
      originalRequest.headers = {
        ...(originalRequest.headers || {}),
        Authorization: `Bearer ${refreshed.access_token}`,
      };
      return api(originalRequest);
    } catch (refreshError) {
      state.clearAuth();
      setAuthToken("");
      return Promise.reject(refreshError);
    }
  }
);

export default api;
