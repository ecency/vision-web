import i18next from "i18next";
import Link from "next/link";
import { EcencyConfigManager } from "@/config";

interface Props {
  /** i18n key of the link text. */
  label: string;
  onClick?: () => void;
  className?: string;
}

/** Entry link to the self-serve recovery page, shown only while the feature is on. */
export function RecoverAccountLink({ label, onClick, className }: Props) {
  return (
    <EcencyConfigManager.Conditional
      condition={({ visionFeatures }) => visionFeatures.accountRecovery.enabled}
    >
      <Link href="/recover-account" onClick={onClick} className={className}>
        {i18next.t(label)}
      </Link>
    </EcencyConfigManager.Conditional>
  );
}
