import { useQuery } from "@tanstack/react-query";
import { getAccountsQueryOptions } from "@ecency/sdk";
import { ProfileLink, UserAvatar } from "@/features/shared";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import {
  Badge,
  Button,
  FormControl,
  InputGroup,
  InputGroupCopyClipboard,
  StyledTooltip
} from "@/features/ui";
import { Form } from "@/features/ui/form";
import i18next from "i18next";
import { useCallback, useMemo, useRef, SetStateAction, Dispatch } from "react";
import { COMMUNITY_NAME_PATTERN } from "../_consts";
import { CommunityCreateCardLayout } from "./community-create-card-layout";
import { Accordion, AccordionCollapse, AccordionToggle } from "@/features/ui/accordion";
import Link from "next/link";

interface Props {
  defaultBeneficiary: { username: string; reward: number };
  fee: string | undefined;
  username: string;
  wif: string;
  setUsername: (v: string) => void;
  setDefaultBeneficiary: Dispatch<SetStateAction<Props["defaultBeneficiary"]>>;
  onSubmit: () => void;
}

export function CommunityCreateAccountStep({
  username,
  setUsername,
  fee,
  onSubmit,
  wif,
  defaultBeneficiary,
  setDefaultBeneficiary
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const { activeUser } = useActiveAccount();

  const { data: accounts } = useQuery(getAccountsQueryOptions([username]));
  const usernameStatus = useMemo(() => {
    if (!new RegExp(COMMUNITY_NAME_PATTERN).test(username)) {
      return "not-valid";
    }

    if (accounts?.[0]?.name === username) {
      return "conflict";
    }

    return "ok";
  }, [username, accounts]);

  const submitForm = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!formRef.current?.checkValidity() || !username) {
      return;
    }

    onSubmit();
  }, []);

  return (
    <CommunityCreateCardLayout>
      <div className="rounded-xl border border-[--border-color] mb-4">
        <div className="px-3 py-1 sm:px-4 sm:py-2 flex justify-between items-center border-b border-[--border-color]">
          <div className="text-sm md:text-base opacity-50">
            {i18next.t("communities-create.creator")}
          </div>
          <ProfileLink
            target="_external"
            className="block hover:opacity-75"
            username={activeUser?.username ?? ""}
          >
            <Badge className="flex items-center gap-1 !p-1 !pr-2">
              <UserAvatar size="small" username={activeUser?.username ?? ""} />
              <span>@{activeUser?.username}</span>
            </Badge>
          </ProfileLink>
        </div>
        <div className="px-3 py-2 sm:px-4 sm:py-3 flex justify-between items-center">
          <StyledTooltip className="flex" content={i18next.t("communities-create.reason-four")}>
            <div className="text-sm md:text-base opacity-50">
              {i18next.t("communities-create.fee")}
            </div>
          </StyledTooltip>
          <Badge>{fee}</Badge>
        </div>
      </div>

      <Form ref={formRef} onSubmit={onSubmit}>
        <div className="mb-4">
          <div className="text-sm font-semibold px-3 mb-2">
            {i18next.t("communities-create.username")}
          </div>
          <FormControl
            type="text"
            autoComplete="off"
            value={username}
            maxLength={11}
            name="username"
            pattern={COMMUNITY_NAME_PATTERN}
            title={i18next.t("communities-create.username-wrong-format")}
            onChange={(e) => setUsername(e.target.value)}
          />

          {usernameStatus === "ok" && (
            <div className="text-sm px-3 text-green">
              {i18next.t("communities-create.username-available")}
            </div>
          )}
          {usernameStatus === "conflict" && (
            <div className="text-sm px-3 text-red">
              {i18next.t("communities-create.username-not-available")}
            </div>
          )}
          {usernameStatus === "not-valid" && (
            <div className="text-sm px-3 text-red">
              {i18next.t("communities-create.username-wrong-format")}
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className="text-sm font-semibold px-3 mb-2">
            {i18next.t("communities-create.password")}
          </div>

          <InputGroupCopyClipboard value={wif} />
        </div>

        <div className="mb-4">
          <label>
            <input type="checkbox" required={true} disabled={true} checked />{" "}
            {i18next.t("communities-create.confirmation")}
          </label>
        </div>

        <Accordion>
          <AccordionToggle eventKey="advanced">
            <div className="-mx-6 px-6 border-y text-sm font-semibold border-[--border-color] cursor-pointer py-4 hover:bg-gray-100 dark:hover:bg-gray-900 duration-300">
              {i18next.t("submit.advanced")}
            </div>
          </AccordionToggle>
          <AccordionCollapse eventKey="advanced" className="py-4">
            <div className="mb-4">
              <div className="text-sm font-semibold px-3 mb-2">
                {i18next.t("communities-create.default-beneficiary")}
                <Link
                  className="font-normal pl-1"
                  target="_blank"
                  href="https://docs.ecency.com/hive/custom-beneficiary/"
                >
                  {i18next.t("communities-create.default-beneficiary-docs")}
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <FormControl
                  type="text"
                  autoComplete="off"
                  value={defaultBeneficiary.username}
                  name="beneficiary"
                  placeholder={i18next.t("communities-create.default-beneficiary-username")}
                  onChange={(e) =>
                    setDefaultBeneficiary((v) => ({
                      ...v,
                      username: e.target.value
                    }))
                  }
                />
                <InputGroup prepend="%">
                  <FormControl
                    type="number"
                    autoComplete="off"
                    value={defaultBeneficiary.reward}
                    min={0}
                    max={100}
                    name="reward"
                    placeholder={i18next.t("communities-create.default-beneficiary-reward")}
                    onChange={(e) =>
                      setDefaultBeneficiary((v) => ({
                        ...v,
                        reward: +e.target.value
                      }))
                    }
                  />
                </InputGroup>
              </div>
            </div>
          </AccordionCollapse>
        </Accordion>
      </Form>

      <div className="flex justify-end">
        <Button disabled={!username} onClick={submitForm}>
          {i18next.t("g.continue")}
        </Button>
      </div>
    </CommunityCreateCardLayout>
  );
}
