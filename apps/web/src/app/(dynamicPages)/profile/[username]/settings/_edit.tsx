import { ImageUploadButton, success } from "@/features/shared";
import { getAccountFullQueryOptions, useAccountUpdate } from "@ecency/sdk";
import { yupResolver } from "@hookform/resolvers/yup";
import { useQuery } from "@tanstack/react-query";
import { UilSave, UilUser } from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import { FormControl, InputGroup } from "@ui/input";
import i18next from "i18next";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as yup from "yup";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getSdkAuthContext, getUser } from "@/utils";

const schema = yup.object({
  name: yup
    .string()
    .required(i18next.t("validation.required"))
    .max(30, i18next.t("validation.max", { count: 30 }) as string),
  about: yup.string().max(160, i18next.t("validation.max", { count: 160 }) as string),
  profile_image: yup
    .string()
    .max(500, i18next.t("validation.max", { count: 500 }) as string)
    .url(i18next.t("validation.url") as string)
    .nullable(),
  cover_image: yup
    .string()
    .max(500, i18next.t("validation.max", { count: 500 }) as string)
    .url(i18next.t("validation.url") as string)
    .nullable(),
  website: yup
    .string()
    .max(100, i18next.t("validation.max", { count: 100 }) as string)
    .url(i18next.t("validation.url") as string)
    .nullable(),
  location: yup.string().max(30, i18next.t("validation.max", { count: 30 }) as string)
});

export function ProfileEdit() {
  const { activeUser } = useActiveAccount();

  const [uploading, setUploading] = useState(false);

  const { data: profile } = useQuery({
    ...getAccountFullQueryOptions(activeUser?.username),
    select: (data) => data?.profile
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isDirty }
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      name: "",
      about: "",
      profile_image: "",
      cover_image: "",
      website: "",
      location: ""
    }
  });

  const { mutateAsync: updateAccount, isPending } = useAccountUpdate(
    activeUser?.username ?? "",
    getSdkAuthContext(getUser(activeUser?.username ?? ""))
  );

  useEffect(() => {
    if (profile) {
      setValue("name", profile.name ?? "");
      setValue("about", profile.about);
      setValue("profile_image", profile.profile_image);
      setValue("cover_image", profile.cover_image);
      setValue("website", profile.website);
      setValue("location", profile.location);
    }
  }, [profile, setValue]);

  return (
    <div className="bg-white rounded-xl p-3 flex flex-col gap-4">
      <div className="text-gray-600 dark:text-gray-400 text-sm flex items-center gap-2">
        <UilUser className="size-4" />
        {i18next.t("profile-edit.title")}
      </div>
      <form
        className="flex flex-col gap-4 items-start"
        onSubmit={handleSubmit(async (values) => {
          await updateAccount({
            profile: {
              name: values.name,
              about: values.about,
              cover_image: values.cover_image ?? undefined,
              profile_image: values.profile_image ?? undefined,
              website: values.website ?? undefined,
              location: values.location,
              pinned: profile?.pinned
            }
          });
          success(i18next.t("g.success"));
        })}
      >
        <div className="grid w-full grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm px-2">{i18next.t("profile-edit.name")}</label>
            <FormControl
              {...register("name")}
              type="text"
              disabled={isPending}
              maxLength={30}
              aria-invalid={!!errors.name}
            />
            {errors.name && <div className="text-red text-xs px-2 mt-1">{errors.name.message}</div>}
          </div>

          <div>
            <label className="text-sm px-2">{i18next.t("profile-edit.about")}</label>
            <FormControl
              {...register("about")}
              type="text"
              disabled={isPending}
              maxLength={160}
              aria-invalid={!!errors.about}
            />
            {errors.about && (
              <div className="text-red text-xs px-2 mt-1">{errors.about.message}</div>
            )}
          </div>
          <div>
            <label className="text-sm px-2">{i18next.t("profile-edit.profile-image")}</label>
            <InputGroup
              className="mb-3"
              append={
                <ImageUploadButton
                  onBegin={() => setUploading(true)}
                  onEnd={(url) => {
                    setValue("profile_image", url, { shouldDirty: true, shouldValidate: true });
                    setUploading(false);
                  }}
                />
              }
            >
              <FormControl
                {...register("profile_image")}
                type="text"
                disabled={isPending}
                placeholder="https://"
                maxLength={500}
                aria-invalid={!!errors.profile_image}
              />
            </InputGroup>
            {errors.profile_image && (
              <div className="text-red text-xs px-2 mt-1">{errors.profile_image.message}</div>
            )}
          </div>
          <div>
            <label className="text-sm px-2">{i18next.t("profile-edit.cover-image")}</label>
            <InputGroup
              className="mb-1"
              append={
                <ImageUploadButton
                  onBegin={() => setUploading(true)}
                  onEnd={(url) => {
                    setValue("cover_image", url, { shouldDirty: true, shouldValidate: true });
                    setUploading(false);
                  }}
                />
              }
            >
              <FormControl
                {...register("cover_image")}
                type="text"
                disabled={isPending}
                placeholder="https://"
                maxLength={500}
                aria-invalid={!!errors.cover_image}
                aria-describedby="profile-edit-cover-hint"
              />
            </InputGroup>
            <p id="profile-edit-cover-hint" className="text-xs text-gray-500 dark:text-gray-400 px-2 mb-3">
              {i18next.t("profile-edit.cover-image-hint")}
            </p>
            {errors.cover_image && (
              <div className="text-red text-xs px-2 mt-1">{errors.cover_image.message}</div>
            )}
          </div>
          <div>
            <label className="text-sm px-2">{i18next.t("profile-edit.website")}</label>
            <FormControl
              {...register("website")}
              type="text"
              disabled={isPending}
              placeholder="https://"
              maxLength={100}
              aria-invalid={!!errors.website}
            />
            {errors.website && (
              <div className="text-red text-xs px-2 mt-1">{errors.website.message}</div>
            )}
          </div>
          <div>
            <label className="text-sm px-2">{i18next.t("profile-edit.location")}</label>
            <FormControl
              {...register("location")}
              type="text"
              disabled={isPending}
              maxLength={30}
              aria-invalid={!!errors.location}
            />
            {errors.location && (
              <div className="text-red text-xs px-2 mt-1">{errors.location.message}</div>
            )}
          </div>
        </div>

        <Button
          size="sm"
          disabled={!isDirty}
          icon={<UilSave />}
          type="submit"
          isLoading={isPending}
        >
          {i18next.t("g.update")}
        </Button>
      </form>
    </div>
  );
}
