import { useCallback, useState } from "react";
import i18next from "i18next";
import { hostingApi, type HostingConfigInput } from "./hosting-api";
import { buildSelfHostZip } from "./self-host-bundle";

interface DownloadArgs {
  username: string;
  config: HostingConfigInput;
  owner?: string;
  domain?: string;
}

/**
 * Ask the hosting API to compose the config, wrap it with the deployment
 * files and hand the archive to the browser. Nothing is created server-side:
 * this branch of the signup never reserves a name or takes a payment.
 */
export function useDownloadSelfHostBundle() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const download = useCallback(async ({ username, config, owner, domain }: DownloadArgs) => {
    setError("");
    setBusy(true);
    try {
      const { config: composed } = await hostingApi.composeConfig(username, config, owner);
      // The pinned tag comes from the platform's own /health, so a bundle
      // pins a build that demonstrably exists rather than a name we guessed.
      // Both images are built from one commit in one CI run, so this tag
      // resolves for the blog image and the hosting-api image alike.
      //
      // It must look like a commit sha: an API built without GIT_SHA answers
      // the literal "unknown", and `sha-unknown` is a tag that cannot be
      // pulled. Refusing beats handing over a bundle that will not start.
      const sha = await hostingApi
        .health()
        .then((h) => (typeof h.sha === "string" ? h.sha.trim().toLowerCase() : ""))
        .catch(() => "");
      if (!/^[0-9a-f]{7,40}$/.test(sha)) {
        setError(i18next.t("hosting.self-host-tag-failed"));
        return false;
      }

      const zip = buildSelfHostZip({
        config: composed,
        username,
        tag: `sha-${sha.slice(0, 7)}`,
        domain
      });

      // Same shape as the wallet's key download: an anchor with a blob URL,
      // clicked and removed, with the URL revoked once the click is handled.
      const blob = new Blob([zip as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const element = document.createElement("a");
      element.setAttribute("href", url);
      element.setAttribute("download", `ecency-blog-${username}.zip`);
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      element.remove();
      setTimeout(() => URL.revokeObjectURL(url), 100);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { download, busy, error, setError };
}
