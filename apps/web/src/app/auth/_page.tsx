"use client";

import useMount from "react-use/lib/useMount";
import { useRouter, useSearchParams } from "next/navigation";
import { consumeHsLoginState, validateToken } from "@/utils";
import { User } from "@/entities";
import { useGlobalStore } from "@/core/global-store";
import { useHsLoginRefresh, useRecordUserActivity } from "@/api/mutations";
import { useCallback } from "react";
import { sentry } from "@/core/sentry/lazy-sentry";
import Image from "next/image";
import i18next from "i18next";
import { UilSpinner } from "@tooni/iconscout-unicons-react";
import { Alert } from "@ui/alert";
import defaults from "@/defaults";

// The state of a login being completed right now. React runs a mount effect
// twice in development (strict mode); the second run must not find the state
// already used and send the user away mid sign-in.
let completing: string | null = null;

export function AuthPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const addUser = useGlobalStore((state) => state.addUser);
  const setActiveUser = useGlobalStore((s) => s.setActiveUser);
  const toggleUiProp = useGlobalStore((s) => s.toggleUiProp);

  const { mutateAsync: recordActivity } = useRecordUserActivity();
  const { mutateAsync: hsTokenRenew } = useHsLoginRefresh();

  const initUser = useCallback(async () => {
    const code = searchParams?.get("code");
    const state = searchParams?.get("state") ?? null;
    if (state && state === completing) {
      return;
    }
    const isValidToken = validateToken(code ?? "");
    // Only a login this tab started: its one-time state must come back.
    const startedHere = consumeHsLoginState(state);

    if (!code || !isValidToken || !startedHere) {
      router.push("/");
      toggleUiProp("login");
      return;
    }

    completing = state;
    try {
      const response = await hsTokenRenew({ code });
      const user: User = {
        username: response.username,
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        expiresIn: response.expires_in,
        postingKey: null,
        loginType: "hivesigner"
      };

      addUser(user);
      setActiveUser(user.username);

      recordActivity({ ty: 20 });

      router.push(`/@${user.username}/feed`);
    } catch (e) {
      sentry.captureException(e);
    } finally {
      completing = null;
    }
  }, [
    addUser,
    hsTokenRenew,
    recordActivity,
    router,
    searchParams,
    setActiveUser,
    toggleUiProp
  ]);

  useMount(() => {
    initUser();
  });

  return (
    <div className="flex gap-4 md:gap-8 lg:gap-12 items-center justify-start flex-col p-4 sm:p-6 md:p-8 lg:p-12 xl:p-16 w-full dark:bg-black">
      <Image src={defaults.logo} alt="logo" width={128} height={128} />
      <h1 className="text-xl md:text-3xl lg:text-4xl xl:text-6xl font-semibold text-blue-dark-sky">
        {i18next.t("hs-login.title")}
      </h1>
      <Alert>
        <p className="md:text-lg lg:text-xl p-2">{i18next.t("hs-login.message")}</p>
      </Alert>
      <UilSpinner className="animate-spin size-6 lg:size-8" />
    </div>
  );
}
