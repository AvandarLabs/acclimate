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
