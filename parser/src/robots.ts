export interface RobotsPolicy {
  allowed: boolean;
  matchedRule?: string;
  fetched: boolean;
}

function pathFromUrl(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function matchesRule(path: string, rule: string): boolean {
  const escaped = rule.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}`).test(path);
}

export function parseRobots(text: string, userAgent = "*"): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/#.*/, "").trim());
  let active = false;
  const disallows: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") active = value === "*" || value.toLowerCase() === userAgent.toLowerCase();
    else if (field === "disallow" && active && value) disallows.push(value);
  }
  return disallows;
}

export async function checkRobots(url: URL, userAgent = "*"): Promise<RobotsPolicy> {
  const robotsUrl = new URL("/robots.txt", url.origin);
  try {
    const response = await fetch(robotsUrl, { headers: { "user-agent": userAgent }, cache: "no-store" });
    if (!response.ok) return { allowed: true, fetched: false };
    const disallows = parseRobots(await response.text(), userAgent);
    const path = pathFromUrl(url);
    const matchedRule = disallows.find((rule) => matchesRule(path, rule));
    return { allowed: !matchedRule, matchedRule, fetched: true };
  } catch {
    // A failed robots request does not grant permission to bypass other access controls.
    // The caller may choose a stricter fail-closed policy if required by deployment.
    return { allowed: true, fetched: false };
  }
}
