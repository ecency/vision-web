"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";

import React, { useState } from "react";
import "./_index.scss";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import { Button } from "@ui/button";
import { List, ListItem } from "@ui/list";
import { getAccountRcQueryOptions, getRcStatsQueryOptions } from "@ecency/sdk";
import { rcFormatter } from "@/utils";
import i18next from "i18next";
import { RcProgressCircle } from "./rc-progress-circle";
import { ClaimAccountCredit } from "../claim-account-credit";
import { ConfirmDelete, RcDelegationsList } from "../rc-delegations-list";
import { ResourceCreditsDelegation } from "@/app/(dynamicPages)/profile/[username]/_components/rc-delegation";
import { FullAccount } from "@/entities";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  rcPercent: number;
  account: FullAccount;
}

export const ResourceCreditsInfo = ({ account, rcPercent }: Props) => {
  const { activeUser } = useActiveAccount();
  const queryClient = useQueryClient();

  const radius = 70;
  const dasharray = 440;
  const unUsedOffset = (rcPercent / 100) * dasharray;
  const usedOffset = ((100 - rcPercent) / 100) * dasharray;

  const [showRcInfo, setShowRcInfo] = useState(false);
  const [delegated, setDelegated] = useState();
  const [receivedDelegation, setReceivedDelegation] = useState();
  const [resourceCredit, setResourceCredit] = useState<any>();
  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [showDelegationsList, setShowDelegationsList] = useState(false);
  const [listMode, setListMode] = useState("");
  const [toFromList, setToFromList] = useState("");
  const [amountFromList, setAmountFromList]: any = useState("");
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [delegateeData, setDelegateeData] = useState("");
  const [commentAmount, setCommentAmount] = useState(0);
  const [voteAmount, setVoteAmount] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [customJsonAmount, setCustomJsonAmount] = useState(0);
  const [claimAccountAmount, setClaimAccountAmount] = useState(0);

  const showModal = () => {
    fetchRCData();
    setShowRcInfo(true);
  };

  const hideModal = () => {
    setShowRcInfo(false);
  };

  const showDelegation = () => {
    setShowDelegationModal(true);
    setShowRcInfo(false);
  };

  const hideDelegation = () => {
    setShowDelegationModal(false);
    setToFromList("");
    setAmountFromList("");
  };

  const showIncomingList = () => {
    setShowDelegationsList(true);
    setListMode("in");
  };

  const showOutGoingList = () => {
    setShowDelegationsList(true);
    setListMode("out");
  };

  const hideList = () => {
    setShowDelegationsList(false);
  };

  const confirmDelete = () => {
    setShowConfirmDelete(true);
    setShowDelegationsList(false);
  };

  const hideConfirmDelete = () => {
    setShowConfirmDelete(false);
  };

  const fetchRCData = () => {
    queryClient
      .fetchQuery(getAccountRcQueryOptions(account.name))
      .then((r) => {
        const outGoing = r.map((a: any) => a.delegated_rc);
        const delegated = outGoing[0];
        const formatOutGoing: any = rcFormatter(delegated);
        setDelegated(formatOutGoing);
        const availableResourceCredit: any = r.map((a: any) => Number(a.rc_manabar.current_mana));
        const inComing: any = r.map((a: any) => Number(a.received_delegated_rc));
        const formatIncoming = rcFormatter(inComing);
        const totalRc = Number(availableResourceCredit) + Number(inComing);
        setReceivedDelegation(formatIncoming);
        setResourceCredit(totalRc);

        const rcOperationsCost = async () => {
          const rcStats: any = await queryClient.fetchQuery(getRcStatsQueryOptions());
          const operationCosts = rcStats.ops;
          const commentCost = operationCosts.comment_operation.avg_cost;
          const transferCost = operationCosts.transfer_operation.avg_cost;
          const voteCost = operationCosts.vote_operation.avg_cost;
          const customJsonOperationsCosts = operationCosts.custom_json_operation.avg_cost;
          const createClaimAccountCost =
            Number(operationCosts.claim_account_operation.avg_cost) * 1.1;

          const commentCount: number = Math.ceil(Number(availableResourceCredit) / commentCost);
          const votetCount: number = Math.ceil(Number(availableResourceCredit) / voteCost);
          const transferCount: number = Math.ceil(Number(availableResourceCredit) / transferCost);
          const customJsonCount: number = Math.ceil(
            Number(availableResourceCredit) / customJsonOperationsCosts
          );
          const createClaimAccountCount: number = Math.floor(
            Number(availableResourceCredit) / createClaimAccountCost
          );
          setCommentAmount(commentCount);
          setVoteAmount(votetCount);
          setTransferAmount(transferCount);
          setCustomJsonAmount(customJsonCount);
          setClaimAccountAmount(createClaimAccountCount);
        };
        rcOperationsCost();
      })
      .catch(console.log);
  };

  return (
    <div>
      <div
        className="cursor-pointer hover:text-blue-dark-sky duration-300 flex flex-col gap-2"
        role="button"
        tabIndex={0}
        onClick={showModal}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            showModal();
          }
        }}
      >
        <div className="text-sm opacity-50">
          <span className="cursor-pointer">{i18next.t("rc-info.resource-credits")}</span>
        </div>

        <div className="bg-gray-200 h-[1rem] text-white rounded-lg flex overflow-hidden">
          <div
            className="flex duration-300 justify-center overflow-hidden text-xs bg-blue-dark-sky"
            role="progressbar"
            style={{ width: `${rcPercent}%` }}
          >
            {i18next.t("rc-info.available")}
          </div>
          <div
            className="flex duration-300 justify-center overflow-hidden text-xs bg-[#F0706A]"
            role="progressbar"
            style={{ width: `${100 - rcPercent}%` }}
          >
            {i18next.t("rc-info.used")}
          </div>
        </div>
      </div>

      <Modal
        size="lg"
        show={showRcInfo}
        centered={true}
        onHide={hideModal}
        className="purchase-qr-dialog"
        dialogClassName="modal-90w"
      >
        <ModalHeader closeButton={true}>
          <ModalTitle>
            <div className="rc-header">
              <span>{i18next.t("rc-info.resource-credits")}</span>
              <div className="about-rc">
                <span>{`${i18next.t("rc-info.check-faq")} `}</span>
                <a href={i18next.t("rc-info.learn-more")}>{i18next.t("rc-info.faq-link")}</a>
              </div>
            </div>
          </ModalTitle>
        </ModalHeader>
        <ModalBody>
          <div className="rc-infocontainer">
            <div className="percent">
              <div className="circle">
                <div className="outer-circle">
                  <div className="inner-circle">
                    <span>{`${rcPercent}%`}</span>
                  </div>
                </div>
                <RcProgressCircle
                  radius={radius}
                  usedOffset={usedOffset}
                  dasharray={dasharray}
                  unUsedOffset={unUsedOffset}
                />
              </div>

              <div className="percentage-info">
                <div className="unused">
                  <div className="unused-box" />
                  <span>{`${i18next.t("rc-info.rc-available")}: ${rcFormatter(
                    (rcPercent / 100) * resourceCredit
                  )}`}</span>
                </div>
                <div className="used">
                  <div className="used-box" />
                  <span>
                    {`${i18next.t("rc-info.rc-used")}: ${rcFormatter(
                      ((100 - rcPercent) / 100) * resourceCredit
                    )}`}
                  </span>
                </div>
              </div>
            </div>

            <div className="rc-details">
              <div className="delegations">
                <span
                  className="outgoing"
                  role="button"
                  tabIndex={0}
                  onClick={showOutGoingList}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      showOutGoingList();
                    }
                  }}
                >
                  {`${i18next.t("rc-info.delegated")}: ${delegated ?? 0}`}
                </span>
                <span
                  className="incoming"
                  role="button"
                  tabIndex={0}
                  onClick={showIncomingList}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      showIncomingList();
                    }
                  }}
                >
                  {`${i18next.t("rc-info.received-delegations")}: ${receivedDelegation ?? 0}`}
                </span>
              </div>

              <div className="line-break my-5">
                <hr />
              </div>

              <div className="extra-details">
                <p>{i18next.t("rc-info.extra-details-heading")}</p>
                <List className="rc-info-extras mt-4">
                  <ListItem>
                    {i18next.t("rc-info.comments-posts")}
                    <span>{commentAmount}</span>
                  </ListItem>
                  <ListItem>
                    {i18next.t("rc-info.votes")}
                    <span>{voteAmount}</span>
                  </ListItem>
                  <ListItem>
                    {i18next.t("rc-info.transfers")}
                    <span>{transferAmount}</span>
                  </ListItem>
                  <ListItem>
                    {i18next.t("rc-info.reblogs-follows")}
                    <span>{customJsonAmount}</span>
                  </ListItem>
                  <ListItem>
                    <ClaimAccountCredit claimAccountAmount={claimAccountAmount} account={account} />
                  </ListItem>
                </List>
              </div>
            </div>
          </div>

          <div className="flex justify-center mt-3">
            {activeUser && (
              <Button onClick={showDelegation}>{i18next.t("rc-info.delegation-button")}</Button>
            )}
          </div>
        </ModalBody>
      </Modal>

      <Modal onHide={hideList} show={showDelegationsList} centered={true} size="lg">
        <ModalHeader closeButton={true}>
          <ModalTitle>
            {listMode === "in" ? i18next.t("rc-info.incoming") : i18next.t("rc-info.outgoing")}
          </ModalTitle>
        </ModalHeader>
        <ModalBody>
          <RcDelegationsList
            account={account}
            showDelegation={showDelegation}
            listMode={listMode}
            setToFromList={setToFromList}
            setAmountFromList={setAmountFromList}
            confirmDelete={confirmDelete}
            setDelegateeData={setDelegateeData}
            setShowDelegationsList={setShowDelegationsList}
          />
        </ModalBody>
      </Modal>

      <div>
        <Modal
          show={showDelegationModal}
          centered={true}
          onHide={hideDelegation}
          className="transfer-dialog"
          size="lg"
        >
          <ModalHeader thin={true} closeButton={true}>
            <ModalTitle />
          </ModalHeader>
          <ModalBody>
            <ResourceCreditsDelegation
              activeUser={activeUser}
              hideDelegation={hideDelegation}
              toFromList={
                toFromList || (account.name !== activeUser?.username ? account.name : "")
              }
              amountFromList={amountFromList}
              delegateeData={delegateeData}
            />
          </ModalBody>
        </Modal>

        <Modal
          show={showConfirmDelete}
          centered={true}
          onHide={hideConfirmDelete}
          className="transfer-dialog"
          // size="lg"
        >
          <ModalHeader thin={true} closeButton={true}>
            <ModalTitle />
          </ModalHeader>
          <ModalBody className="border rounded-2xl">
            <ConfirmDelete to={toFromList} hideConfirmDelete={hideConfirmDelete} />
          </ModalBody>
        </Modal>
      </div>
    </div>
  );
};
