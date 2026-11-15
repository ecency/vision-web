import { ErrorTypes } from "@/enums";
import i18next from "i18next";

const handleChainError = (strErr: string): [string | null, ErrorTypes] => {
  if (/You may only post once every/.test(strErr)) {
    return [i18next.t("chain-error.min-root-comment"), ErrorTypes.COMMON];
  } else if (/Your current vote on this comment is identical/.test(strErr)) {
    return [i18next.t("chain-error.identical-vote"), ErrorTypes.INFO];
  } else if (/Must claim something/.test(strErr)) {
    return [i18next.t("chain-error.must-claim"), ErrorTypes.INFO];
  } else if (/Cannot claim that much VESTS/.test(strErr)) {
    return [i18next.t("chain-error.must-claim"), ErrorTypes.INFO];
  } else if (/Please wait to transact|needs \d+ RC|has insufficient RC/.test(strErr)) {
    return [
      i18next.t("chain-error.insufficient-resource"),
      ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS
    ];
  } else if (/Cannot delete a comment with net positive/.test(strErr)) {
    return [i18next.t("chain-error.delete-comment-with-vote"), ErrorTypes.INFO];
  } else if (/children == 0/.test(strErr)) {
    return [i18next.t("chain-error.comment-children"), ErrorTypes.COMMON];
  } else if (/comment_cashout/.test(strErr)) {
    return [i18next.t("chain-error.comment-cashout"), ErrorTypes.COMMON];
  } else if (/Votes evaluating for comment that is paid out is forbidden/.test(strErr)) {
    return [i18next.t("chain-error.paid-out-post-forbidden"), ErrorTypes.COMMON];
  } else if (/Missing Active Authority/.test(strErr)) {
    return [i18next.t("chain-error.missing-authority"), ErrorTypes.INFO];
  } else if (/Missing Owner Authority/.test(strErr)) {
    return [i18next.t("chain-error.missing-owner-authority"), ErrorTypes.INFO];
  }

  return [null, ErrorTypes.COMMON];
};

export const formatError = (err: any): [string, ErrorTypes] => {
  let [chainErr, type] = handleChainError(err.toString());
  if (chainErr) {
    return [chainErr, type];
  }

  if (err.error_description && typeof err.error_description === "string") {
    let [chainErr, type] = handleChainError(err.error_description);
    if (chainErr) {
      return [chainErr, type];
    }

    return [err.error_description.substring(0, 80), ErrorTypes.COMMON];
  }

  if (err.message && typeof err.message === "string") {
    let [chainErr, type] = handleChainError(err.message);
    if (chainErr) {
      return [chainErr, type];
    }

    return [err.message.substring(0, 80), ErrorTypes.COMMON];
  }

  return ["", ErrorTypes.COMMON];
};
