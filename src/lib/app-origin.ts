function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** Returns the trusted public origin used in authentication emails. */
export function getAppOrigin(requestUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_APP_URL is required in production.");
  }

  let url: URL;
  try {
    url = new URL(configured || requestUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid absolute URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS.");
  }
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:" &&
    !isLocalHostname(url.hostname)
  ) {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS in production.");
  }
  if (configured && (url.pathname !== "/" || url.search || url.hash)) {
    throw new Error("NEXT_PUBLIC_APP_URL must contain an origin only, without a path, query, or fragment.");
  }

  return url.origin;
}
