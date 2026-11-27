import { NPM_REGISTRY_URL } from "../releaseConfig";

/**
 * True when `name@version` is on the npm registry, false on a 404. Any other
 * response throws, so an outage is never mistaken for "not published".
 */
export async function isVersionPublished(params: {
  name: string;
  version: string;
  fetchFn: typeof fetch;
}): Promise<boolean> {
  const { name, version, fetchFn } = params;
  const response = await fetchFn(
    `${NPM_REGISTRY_URL}/${name.replace("/", "%2F")}/${version}`,
  );
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(`npm registry returned ${response.status}.`);
  }
  return true;
}

/**
 * Like `isVersionPublished`, but retries on 404 so a version that was just
 * published is not missed while the registry is still propagating it.
 *
 * @returns True once the version is listed, false if every attempt got a 404.
 */
export async function waitForVersionPublished(params: {
  name: string;
  version: string;
  fetchFn: typeof fetch;
  sleepFn?: (delayMs: number) => Promise<void>;
  maxAttempts?: number;
  delayMs?: number;
}): Promise<boolean> {
  const {
    sleepFn = (delayMs) => {
      return new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    },
    maxAttempts = 6,
    delayMs = 10_000,
    ...lookup
  } = params;

  for (
    let attemptNumber = 1;
    attemptNumber <= maxAttempts;
    attemptNumber += 1
  ) {
    if (await isVersionPublished(lookup)) {
      return true;
    }
    if (attemptNumber < maxAttempts) {
      await sleepFn(delayMs);
    }
  }
  return false;
}
