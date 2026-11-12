import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import { Spinner } from "@ui/spinner";
import { FormControl } from "@ui/input";
import i18next from "i18next";
import { Alert } from "@ui/alert";
import { FormattedCurrency, ProfileLink, UserAvatar } from "@/features/shared";
import { accountReputation, dateToFormatted, dateToFullRelative, formattedNumber } from "@/utils";
import { Tooltip } from "@ui/tooltip";
import { Pagination } from "@/features/ui";
import React, { ReactNode, useMemo, useState } from "react";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { getEntryActiveVotesQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { prepareVotes } from "@/features/shared/entry-vote-btn/utils";
import { heartSvg } from "@ui/svg";
import { Entry } from "@/entities";
import { useViewerVote } from "@/core/hooks/use-viewer-vote";
import { sortVotes, type VoteSortOption } from "@/features/shared/entry-votes/sort-votes";

// The same options sortVotes takes, reputation included (the select offers it).
type SortOption = VoteSortOption;

interface Props {
  /** See EntryVotes: size-N sink class for the vote icon; defaults to "[&>svg]:size-3.5". */
  iconSizeClass?: string;
  entry?: Entry;
  icon?: ReactNode;
  onHide: () => void;
  totalVotes: number;
  hasDifferentVotes: boolean;
}

export function EntryVotesDialog({
  entry: initialEntry,
  icon,
  iconSizeClass = "[&>svg]:size-3.5",
  onHide,
  totalVotes,
  hasDifferentVotes
}: Props) {
  const { data: entry, dataUpdatedAt: entryUpdatedAt } = useQuery(
    EcencyEntriesCacheManagement.getEntryQuery(initialEntry)
  );

  const { data: apiVotes, isLoading: areVotesLoading } = useQuery(getEntryActiveVotesQueryOptions(entry));

  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [sort, setSort] = useState<SortOption>("reward");

  const viewerVote = useViewerVote(entry, entryUpdatedAt);
  const isVoted = viewerVote.upVoted || viewerVote.downVoted;

  const preparedVotes = useMemo(() => prepareVotes(entry!, apiVotes ?? []), [apiVotes, entry]);
  const votes = useMemo(
    () =>
      preparedVotes.filter((item) =>
        item.voter.toLocaleLowerCase().includes(searchText.toLocaleLowerCase())
      ),
    [searchText, preparedVotes]
  );
  const title = useMemo(
    () =>
      totalVotes === 0
        ? i18next.t("entry-votes.title-empty")
        : totalVotes === 1
          ? i18next.t("entry-votes.title")
          : i18next.t("entry-votes.title-n", { n: totalVotes }),
    [totalVotes]
  );
  const sliced = useMemo(() => {
    const pageSize = 12;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return sortVotes(votes, sort).slice(start, end);
  }, [page, votes, sort]);
  const hasCurrentUserVote = isVoted;

  const child = (
    <>
      <div
        className={`heart-icon ${isVoted ? "voted" : ""} ${
          hasDifferentVotes && hasCurrentUserVote ? "vote-done" : ""
        } ${iconSizeClass ?? ""}`}
      >
        {icon ?? heartSvg}
      </div>
      {totalVotes}
    </>
  );

  if (totalVotes === 0) {
    return (
      <div className="entry-votes notranslate">
        <Tooltip content={title}>
          <span className="inner-btn no-data">{child}</span>
        </Tooltip>
      </div>
    );
  }

  return (
    <Modal
      onHide={() => {
        onHide();
        setSearchText("");
      }}
      show={true}
      centered={true}
      size="lg"
      className="entry-votes-modal px-3"
    >
      <ModalHeader closeButton={true} className="items-center">
        <ModalTitle>{title}</ModalTitle>
      </ModalHeader>
      {areVotesLoading ? (
        <div className="dialog-loading">
          <Spinner className="size-4" />
        </div>
      ) : (
        <>
          <div className="w-full px-3 mb-4">
            <FormControl
              type="text"
              placeholder={i18next.t("friends.search-placeholder")}
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setPage(1);
              }}
              disabled={areVotesLoading}
            />
          </div>
          <ModalBody>
            {totalVotes !== votes.length && (
              <Alert className="mb-4" appearance="warning">
                {i18next.t("entry-votes.pending-message")}
              </Alert>
            )}
            <div className="voters-list">
              <div className="list-body">
                {sliced && sliced.length > 0
                  ? sliced.map((x) => {
                      return (
                        <div className="list-item" key={x.voter}>
                          <div className="item-main">
                            <ProfileLink username={x.voter}>
                              <UserAvatar username={x.voter} size="small" />
                            </ProfileLink>

                            <div className="item-info">
                              <ProfileLink username={x.voter}>
                                <span className="item-name notranslate">{x.voter}</span>
                              </ProfileLink>
                              {x.reputation !== undefined && (
                                <span className="item-reputation">
                                  {accountReputation(x.reputation)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="item-extra">
                            <FormattedCurrency value={x.reward ?? 0} fixAt={3} />
                            <span className="separator" />
                            {formattedNumber(x.percent, { fractionDigits: 1, suffix: "%" })}
                            <span className="separator" />
                            <Tooltip content={dateToFormatted(x.time)}>
                              <span>{dateToFullRelative(x.time)}</span>
                            </Tooltip>
                          </div>
                        </div>
                      );
                    })
                  : i18next.t("communities.no-results")}
              </div>
            </div>
            <div className="list-tools">
              <div className="pages">
                {votes.length > pageSize && (
                  <Pagination
                    dataLength={votes.length}
                    pageSize={pageSize}
                    maxItems={4}
                    page={page}
                    onPageChange={(page) => setPage(page)}
                  />
                )}
              </div>
              <div className="sorter">
                <span className="label">{i18next.t("entry-votes.sort")}</span>
                <FormControl
                  type="select"
                  onChange={(e: any) => setSort(e.target.value)}
                  value={sort}
                >
                  <option value="reward">{i18next.t("entry-votes.sort-reward")}</option>
                  <option value="timestamp">{i18next.t("entry-votes.sort-timestamp")}</option>
                  <option value="reputation">{i18next.t("entry-votes.sort-reputation")}</option>
                  <option value="percent">{i18next.t("entry-votes.sort-percent")}</option>
                </FormControl>
              </div>
            </div>
          </ModalBody>
        </>
      )}
    </Modal>
  );
}
