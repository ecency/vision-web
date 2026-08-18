"use client";
import { ProfileEdit } from "./_edit";
import { PermissionsCard } from "./_permissions-card";
import { Preferences } from "./_preferences";
import { ReferralInfo } from "./_referral-info";
import { DmPrivacySettings } from "./_dm-privacy";
import { SupportEcencySettings } from "./_support-ecency";
import { EmailDigestsSettings } from "./_email-digests";
import { EcencyConfigManager } from "@/config";

export function ProfileSettings() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ProfileEdit />
      <Preferences />

      <SupportEcencySettings />

      <DmPrivacySettings />

      <EcencyConfigManager.Conditional condition={({ visionFeatures }) => visionFeatures.newsletter.enabled}>
        <EmailDigestsSettings />
      </EcencyConfigManager.Conditional>

      <PermissionsCard />
      <ReferralInfo />
    </div>
  );
}
