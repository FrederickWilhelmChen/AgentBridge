import axios, { type AxiosInstance } from "axios";

export function createLarkHttpInstance(proxyUrl: string | null): AxiosInstance {
  const proxy = parseAxiosProxyConfig(proxyUrl);
  const instance = axios.create({
    ...(proxy ? { proxy } : {})
  });

  instance.interceptors.request.use((req) => {
    if (req.headers) {
      req.headers["User-Agent"] = "oapi-node-sdk/1.0.0";
    }

    return req;
  }, undefined, { synchronous: true });

  instance.interceptors.response.use((resp) => {
    const shouldReturnHeaders = (resp.config as unknown as { $return_headers?: boolean }).$return_headers;
    if (shouldReturnHeaders) {
      return {
        data: resp.data,
        headers: resp.headers
      };
    }

    return resp.data;
  });

  return instance;
}

export function parseAxiosProxyConfig(proxyUrl: string | null): {
  protocol: "http" | "https";
  host: string;
  port: number;
} | null {
  if (!proxyUrl) {
    return null;
  }

  const parsed = new URL(proxyUrl);
  return {
    protocol: parsed.protocol === "https:" ? "https" : "http",
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80
  };
}
