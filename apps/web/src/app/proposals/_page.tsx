"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import numeral from "numeral";
import defaults from "@/defaults";
import { setProxyBase } from "@ecency/render-helper";
import "./_page.scss";
import { Feedback } from "@/features/shared/feedback";
import { LinearProgress } from "@/features/shared/linear-progress";
import { Navbar } from "@/features/shared/navbar";
import { ScrollToTop } from "@/features/shared/scroll-to-top";
import { SearchBox } from "@/features/shared/search-box";
import { Theme } from "@/features/shared/theme";
import { Tsx } from "@/features/i18n/helper";
import i18next from "i18next";
import { ProposalCreateForm, ProposalListItem } from "@/app/proposals/_components";
import { parseAsset } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { getAccountFullQueryOptions, getProposalsQueryOptions, getUserProposalVotesQueryOptions } from "@ecency/sdk";
import { Proposal } from "@/entities";
import { useInViewport } from "react-in-viewport";
import { useDebounce } from "react-use";
import { useSearchParams } from "next/navigation";
import { useActiveAccount } from "@/core/hooks/use-active-account";
setProxyBase(defaults.imageServer);

enum Filter {
  ALL = "all",
  ACTIVE = "active",
  INACTIVE = "inactive",
  TEAM = "team",
  CREATE = "create"
}

export function ProposalsPage() {
  const infiniteLoadingAnchorRef = useRef<HTMLDivElement>(null);

  const searchParams = useSearchParams();
  const { activeUser } = useActiveAccount();

  const { data: proposals, isLoading } = useQuery(getProposalsQueryOptions());
  const { data: fund } = useQuery(getAccountFullQueryOptions("hive.fund"));

  // Fetch all user votes once instead of per-proposal (optimization!)
  // Use ?voter= param if present, otherwise fallback to logged-in user
  const voterParam = searchParams?.get("voter") ?? activeUser?.username ?? "";
  const { data: userVotes } = useQuery(getUserProposalVotesQueryOptions(voterParam));

  // Create a Set of proposal IDs that the user voted on for fast lookup
  const userVotedProposalIds = useMemo(
    () =>
      new Set(
        userVotes
          ?.map((v) => v.proposal?.proposal_id)
          .filter((id): id is number => id !== undefined) ?? []
      ),
    [userVotes]
  );

  const [page, setPage] = useState(1);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(Filter.ALL);

  const filteredProposals = useMemo(
    () =>
      proposals
        ?.filter((item) => {
          switch (filter) {
            case Filter.ALL:
              return true;
            case Filter.ACTIVE:
              return item.status == "active";
            case Filter.INACTIVE:
              return item.status == "inactive";
            case Filter.TEAM:
              return (
                ["ecency", "good-karma", "hivesearcher", "hivesigner", "hivexplorer"].includes(
                  item.creator
                ) &&
                (item.status === "active" || new Date(item.start_date) > new Date())
              );
            default:
              return true;
          }
        })
        ?.filter(
          (item) =>
            item.subject.toLowerCase().search(search.toLowerCase().trim()) > -1 ||
            item.creator.toLowerCase().search(search.toLowerCase().trim()) > -1
        ),
    [filter, proposals, search]
  );
  const sliced = useMemo(() => filteredProposals?.slice(0, page * 5), [filteredProposals, page]);
  const totalBudget = useMemo(
    () => parseAsset(fund?.hbd_balance ?? "0").amount,
    [fund?.hbd_balance]
  );
  const dailyBudget = useMemo(() => totalBudget / 100, [totalBudget]);
  const { dailyFunded, thresholdProposalId } = useMemo(() => {
    const teligible = proposals?.filter(
      (proposal) => proposal.status !== "expired" && proposal.status !== "inactive"
    );
    const eligible: Proposal[] = [];
    for (const eKey in teligible) {
      if (teligible[eKey as any].id != 0) {
        eligible[eKey as any] = teligible[eKey as any];
      } else {
        break;
      }
    }
    //  add up total votes
    let thresholdProposalId: number | null = null;
    const dailyFunded = eligible.reduce((a, b) => {
      const dp = parseAsset(b.daily_pay);
      const _sum_amount = a + Number(dp.amount);
      if (_sum_amount >= dailyBudget && !thresholdProposalId) {
        thresholdProposalId = b.id;
      }
      return _sum_amount <= dailyBudget ? _sum_amount : a;
    }, 0);
    return {
      dailyFunded,
      thresholdProposalId
    };
  }, [dailyBudget, proposals]);

  const { inViewport } = useInViewport(infiniteLoadingAnchorRef, {
    rootMargin: "0px 0px 200px 0px"
  });

  useDebounce(
    () => {
      if (inViewport) {
        setPage((page) => page + 1);
      }
    },
    1000,
    [inViewport]
  );

  useEffect(() => {
    if (!searchParams?.has("filter")) {
      return;
    }
    const filterParam = searchParams.get("filter") ?? "";
    if (filterParam === "ecency") {
      setFilter(Filter.TEAM);
      return;
    }
    if ((Object.values(Filter) as string[]).includes(filterParam)) {
      setFilter(filterParam as Filter);
      return;
    }
    setFilter(Filter.ALL);
    setSearch(filterParam);
  }, [searchParams]);

  const showCreateForm = filter === Filter.CREATE;
  const showProposalsList = !showCreateForm;

  return (
    <div className="reading-background">
      <ScrollToTop />
      <Theme />
      <Feedback />
      <Navbar />

      <div className="app-content proposals-page">
        <div className="page-header mt-5">
          <h1 className="header-title">{i18next.t("proposals.page-title")}</h1>
          <Tsx k="proposals.page-description">
            <div className="header-description" />
          </Tsx>
          <div className="funding-numbers">
            <div className="funding-number">
              <div className="value">
                {numeral(dailyFunded).format("0.00,")} {"HBD"}
              </div>
              <div className="label">{i18next.t("proposals.daily-funded")}</div>
            </div>
            <div className="funding-number">
              <div className="value">
                {numeral(dailyBudget).format("0.00,")} {"HBD"}
              </div>
              <div className="label">{i18next.t("proposals.daily-budget")}</div>
            </div>

            <div className="funding-number">
              <div className="value">
                {numeral(totalBudget).format("0.00,")} {"HBD"}
              </div>
              <div className="label">{i18next.t("proposals.total-budget")}</div>
            </div>
          </div>

          <div className="search-proposals">
            <SearchBox
              placeholder={i18next.t("search.placeholder-proposals")}
              onChange={(e: any) => setSearch(e.target.value)}
              value={search}
            />
          </div>

          <div className="filter-menu">
            {Object.values(Filter).map((x) => {
              const cls = `menu-item ${filter === x ? "active-item" : ""}`;
              return (
                <a
                  key={x}
                  href="#"
                  className={cls}
                  onClick={(e) => {
                    e.preventDefault();
                    setFilter(x);
                  }}
                >
                  {i18next.t(`proposals.filter-${x}`)}
                </a>
              );
            })}
          </div>
        </div>
        {showCreateForm && (
          <div id="proposal-create-form">
            <ProposalCreateForm />
          </div>
        )}
        {showProposalsList && isLoading && <LinearProgress />}
        {showProposalsList && (sliced?.length ?? 0) > 0 && (
          <div className="proposal-list">
            {sliced?.map((p) => (
              <ProposalListItem
                key={p.id}
                proposal={p}
                thresholdProposalId={thresholdProposalId}
                votedByViewer={userVotedProposalIds.has(p.proposal_id)}
              />
            ))}

            <div ref={infiniteLoadingAnchorRef} />
          </div>
        )}
      </div>
    </div>
  );
}
