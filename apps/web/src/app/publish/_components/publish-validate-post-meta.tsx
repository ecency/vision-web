import { FormControl } from "@/features/ui";
import { usePublishState } from "../_hooks";
import i18next from "i18next";
import { SUBMIT_DESCRIPTION_MAX_LENGTH } from "@/app/submit/_consts";

export function PublishValidatePostMeta() {
  const { title, metaDescription, editMetaDescription } = usePublishState();

    return (
    <div className="flex flex-col gap-2">
      <FormControl className="text-sm" type="text" disabled={true} value={title} />
      <FormControl
        className="text-sm min-h-[100px]"
        placeholder={i18next.t("publish.preview-subtitle")}
        type="textarea"
        value={metaDescription}
        onChange={(e) => editMetaDescription((e.target as HTMLTextAreaElement).value)}
        maxLength={SUBMIT_DESCRIPTION_MAX_LENGTH}
      />
    </div>
  );
}
