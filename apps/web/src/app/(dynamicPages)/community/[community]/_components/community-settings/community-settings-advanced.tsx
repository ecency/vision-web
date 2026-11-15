import { useActiveAccount } from "@/core/hooks/use-active-account";
import { FormControl, InputGroup } from "@/features/ui";
import i18next from "i18next";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFormContext } from "react-hook-form";

export function CommunitySettingsAdvanced() {
  const { activeUser } = useActiveAccount();
  const { community } = useParams();
  const { register } = useFormContext();

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-2 pt-2 md:px-4">
        <div>
          <div className="text-sm font-semibold px-3 mb-2">
            {i18next.t("community-settings.description")}
          </div>
          <FormControl {...register("description")} type="textarea" />
        </div>
        <div>
          <div className="text-sm font-semibold px-3 mb-2">
            {i18next.t("community-settings.rules")}
          </div>

          <FormControl {...register("rules")} type="textarea" />
          <div className="text-sm px-3">{i18next.t("community-settings.rules-help")}</div>
        </div>
        <div>
          <div className="text-sm font-semibold px-3 mb-2">NSFW</div>
          <FormControl {...register("nsfw")} type="select">
            <option value="true">{i18next.t("g.yes")}</option>
            <option value="false">{i18next.t("g.no")}</option>
          </FormControl>
        </div>
      </div>

      <div className="border-b border-[--border-color] w-full" />
      <div className="p-2 md:px-4">
        <div className="text-sm flex px-3 items-center mb-2 gap-1">
          <div className="font-semibold">{i18next.t("communities-create.default-beneficiary")}</div>
          <Link target="_blank" href="https://docs.ecency.com/hive/custom-beneficiary/">
            {i18next.t("communities-create.default-beneficiary-docs")}
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormControl
            {...register("defaultBeneficiaryUsername")}
            disabled={activeUser?.username !== community}
            type="text"
            autoComplete="off"
            placeholder={i18next.t("communities-create.default-beneficiary-username")}
          />
          <InputGroup prepend="%">
            <FormControl
              {...register("defaultBeneficiaryReward")}
              disabled={activeUser?.username !== community}
              type="number"
              autoComplete="off"
              placeholder={i18next.t("communities-create.default-beneficiary-reward")}
            />
          </InputGroup>
        </div>
      </div>
    </>
  );
}
