import { useDelegateVestingSharesMutation } from "@/api/sdk-mutations";
import { DEFAULT_DYNAMIC_PROPS } from "@/consts/default-dynamic-props";
import { error, LinearProgress, ProfileLink, UserAvatar } from "@/features/shared";
import { formatError } from "@/api/format-error";
import { List, ListItem } from "@/features/ui/list";
import { formattedNumber, parseAsset, vestsToHp } from "@/utils";
import { getDynamicPropsQueryOptions } from "@ecency/sdk";
import { getHivePowerDelegatesInfiniteQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { Pagination, Tooltip } from "@ui/index";
import { FormControl } from "@ui/input";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import i18next from "i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { reportRcRejection } from "@/api/rc-shortfall-report";

const delegationKey = (item: { delegatee: string; vesting_shares: string }) =>
  `${item.delegatee} ${item.vesting_shares}`;

interface Props {
  username: string;
  show: boolean;
  setShow: (v: boolean) => void;
  totalDelegated: string;
}

export function DelegatedVesting({ username, show, setShow, totalDelegated }: Props) {
  const { activeUser } = useActiveAccount();

  const { data: dynamicProps } = useQuery(getDynamicPropsQueryOptions());

  const [subtitle, setSubtitle] = useState("");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  const { data: delegations, isLoading } = useQuery({
    ...getHivePowerDelegatesInfiniteQueryOptions(username, 1000),
    select: (data) =>
      data?.sort(
        (a, b) => parseAsset(b.vesting_shares).amount - parseAsset(a.vesting_shares).amount
      )
  });

  const { mutateAsync: delegate } = useDelegateVestingSharesMutation();
  // Per row: the mutation's isPending is one flag for every row (#2198).
  // Each attempt has its own number, so an earlier attempt settling late does
  // not clear a later one's mark.
  const [pending, setPending] = useState<ReadonlyMap<string, number>>(new Map());
  const attempts = useRef(0);
  // A signing abandoned in HiveSigner never settles: closing the dialog ends
  // the wait, so reopening offers Undelegate again.
  useEffect(() => {
    if (!show) setPending(new Map());
  }, [show]);
  // Undelegated rows stay hidden while the cached list still holds them (the
  // refresh lands seconds after the broadcast), whether or not the dialog was
  // closed in between, so Undelegate is not offered on a delegation that is
  // gone. Keyed by amount too, so a new delegation of another amount shows.
  const [undelegated, setUndelegated] = useState<ReadonlySet<string>>(new Set());
  // A list without the row confirms it gone: a later delegation of the same
  // amount shows again.
  useEffect(() => {
    if (!delegations) return;
    setUndelegated((set) => {
      const live = new Set(delegations.map(delegationKey));
      const kept = new Set([...set].filter((key) => live.has(key)));
      return kept.size === set.size ? set : kept;
    });
  }, [delegations]);

  const undelegate = (item: { delegatee: string; vesting_shares: string }, by: string) => {
    const { delegatee } = item;
    if (pending.has(delegatee)) return;
    const attempt = ++attempts.current;
    setPending((map) => new Map(map).set(delegatee, attempt));
    delegate({ delegatee, vestingShares: "0.000000 VESTS" })
      .then(() => setUndelegated((set) => new Set(set).add(delegationKey(item))))
      .catch((err) => {
        // Was an unhandled rejection with no feedback at all.
        reportRcRejection(err, "transfer", by);
        error(...formatError(err));
      })
      .finally(() =>
        setPending((map) => {
          if (map.get(delegatee) !== attempt) return map;
          const next = new Map(map);
          next.delete(delegatee);
          return next;
        })
      );
  };

  const data = useMemo(
    () =>
      delegations?.filter(
        (item) =>
          !undelegated.has(delegationKey(item)) &&
          item.delegatee.toLocaleLowerCase().includes(searchText.toLocaleLowerCase())
      ) ?? [],
    [delegations, searchText, undelegated]
  );
  // Hiding the last row of the last page moves back a page.
  const shownPage = Math.min(page, Math.max(1, Math.ceil(data.length / pageSize)));
  const sliced = useMemo(
    () => data.slice((shownPage - 1) * pageSize, (shownPage - 1) * pageSize + pageSize),
    [data, shownPage, pageSize]
  );

  useEffect(() => {
    const totalDelegatedValue = data.reduce((n, item) => {
      let parsedValue: any = parseAsset(item.vesting_shares).amount;
      parsedValue = vestsToHp(parsedValue, (dynamicProps ?? DEFAULT_DYNAMIC_PROPS).hivePerMVests);
      parsedValue = formattedNumber(parsedValue);
      parsedValue = parsedValue.replace(/,/g, "");
      parsedValue = parseFloat(parsedValue);
      parsedValue = n + parsedValue;
      return parsedValue;
    }, 0);

    const totalDelegatedNumbered = parseFloat(totalDelegated.replace(" HP", "").replace(",", ""));
    const toBeReturned = totalDelegatedNumbered - totalDelegatedValue;
    setSubtitle(toBeReturned.toFixed(3));
  }, [data, dynamicProps, totalDelegated]);

  return (
    <Modal onHide={() => setShow(false)} show={show} centered={true}>
      <ModalHeader closeButton={true}>
        <ModalTitle>
          <div>
            <div>{i18next.t("delegated-vesting.title")}</div>
            <div className="text-gray-600 mt-3 text-sm">{subtitle}</div>
          </div>
        </ModalTitle>
      </ModalHeader>

      <div className="w-full mb-4 px-3">
        <FormControl
          type="text"
          placeholder={i18next.t("friends.search-placeholder")}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>
      <ModalBody>
        {isLoading && <LinearProgress />}
        {!isLoading && (
          <div
            className={`delegated-vesting-content ${isLoading ? "in-progress" : ""}`}
          >
            <div className="user-list">
              <List defer={true} grid={true} inline={true} className="list-body">
                {sliced.length === 0 && (
                  <div className="empty-list">{i18next.t("g.empty-list")}</div>
                )}
                {sliced.map((x) => (
                  <ListItem styledDefer={true} className="list-item" key={x.delegatee}>
                    <div className="item-main">
                      <ProfileLink username={x.delegatee}>
                        <UserAvatar username={x.delegatee} size="small" />
                      </ProfileLink>
                      <div className="item-info">
                        <ProfileLink username={x.delegatee}>
                          <span className="item-name notranslate">{x.delegatee}</span>
                        </ProfileLink>
                      </div>
                    </div>
                    <div className="item-extra">
                      <Tooltip content={x.vesting_shares}>
                        <span>
                          {formattedNumber(
                            vestsToHp(
                              parseAsset(x.vesting_shares).amount,
                              (dynamicProps ?? DEFAULT_DYNAMIC_PROPS).hivePerMVests
                            ),
                            { suffix: "HP" }
                          )}
                        </span>
                      </Tooltip>
                      {/* These rows are delegations BY the profile owner, so only the
                          owner (the delegator) can undelegate them (#2197). */}
                      {activeUser && activeUser.username === username && (
                        <a
                          href="#"
                          className="undelegate"
                          onClick={(e) => {
                            e.preventDefault();
                            undelegate(x, activeUser.username);
                          }}
                        >
                          {pending.has(x.delegatee)
                            ? "..."
                            : i18next.t("delegated-vesting.undelegate")}
                        </a>
                      )}
                    </div>
                  </ListItem>
                ))}
              </List>
              <Pagination
                className="mt-4"
                dataLength={data.length}
                pageSize={pageSize}
                maxItems={4}
                page={shownPage}
                onPageChange={(page: number) => setPage(page)}
              />
            </div>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
