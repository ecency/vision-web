import React, { useMemo, useState } from "react";
import "./_index.scss";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import { Button } from "@ui/button";
import { Community } from "@/entities";
import i18next from "i18next";
import { LinearProgress } from "@/features/shared";
import { useCommunityRewardsRegisterMutation } from "@/api/sdk-mutations";
import { getRewardedCommunitiesQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";

interface Props {
  community: Community;
  onHide: () => void;
}

export function CommunityRewardsRegistrationDialog({ onHide, community }: Props) {
  const [done, setDone] = useState(false);

  const { data: rewardedCommunities, isLoading: isRewardingFetching } = useQuery(getRewardedCommunitiesQueryOptions());

  const { mutateAsync: register, isPending } = useCommunityRewardsRegisterMutation();

  const registered = useMemo(
    () => rewardedCommunities?.find((x) => x.name === community.name),
    [community.name, rewardedCommunities]
  );
  const loading = useMemo(
    () => isPending || isRewardingFetching,
    [isPending, isRewardingFetching]
  );

  return (
    <Modal
      show={true}
      centered={true}
      onHide={onHide}
      className="community-rewards-registration-dialog"
    >
      <ModalHeader closeButton={true} />
      <ModalBody>
        {loading ? (
          <LinearProgress />
        ) : done ? (
          <div className="dialog-content">
            <p className="text-info-default">
              {i18next.t("community-rewards-registration.done-body-text")}
            </p>
            <Button size="sm" onClick={onHide}>
              {i18next.t("g.close")}
            </Button>
          </div>
        ) : registered ? (
          <div className="dialog-content">
            <p className="text-info-default">
              {i18next.t("community-rewards-registration.conflict-body-text")}
            </p>
            <Button size="sm" onClick={onHide}>
              {i18next.t("g.close")}
            </Button>
          </div>
        ) : community.subscribers < 100 ? (
          <div className="dialog-content">
            <p className="text-red">
              {i18next.t("community-rewards-registration.min-required-body-text")}
            </p>
            <Button size="sm" onClick={onHide}>
              {i18next.t("g.close")}
            </Button>
          </div>
        ) : (
          <div className="dialog-content">
            <p>{i18next.t("community-rewards-registration.body-text")}</p>
            <Button
              size="sm"
              onClick={async () => {
                await register({ name: community.name });
                setDone(true);
              }}
            >
              {i18next.t("community-rewards-registration.btn-next-label")}
            </Button>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
