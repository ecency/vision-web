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
import { useEffect, useMemo, useState } from "react";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { reportRcRejection } from "@/api/rc-shortfall-report";

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
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  // Undelegated here: hidden from the list, so Undelegate is not offered again
  // on a delegation that is gone while the refreshed list is on its way.
  const [undelegated, setUndelegated] = useState<ReadonlySet<string>>(new Set());

  const undelegate = (delegatee: string, by: string) => {
    if (pending.has(delegatee)) return;
    setPending((set) => new Set(set).add(delegatee));
    delegate({ delegatee, vestingShares: "0.000000 VESTS" })
      .then(() => setUndelegated((set) => new Set(set).add(delegatee)))
      .catch((err) => {
        // Was an unhandled rejection with no feedback at all.
        reportRcRejection(err, "transfer", by);
        error(...formatError(err));
      })
      .finally(() =>
        setPending((set) => {
          const next = new Set(set);
          next.delete(delegatee);
          return next;
        })
      );
  };

  const data = useMemo(
    () =>
      delegations?.filter(
        (item) =>
          !undelegated.has(item.delegatee) &&
          item.delegatee.toLocaleLowerCase().includes(searchText.toLocaleLowerCase())
      ) ?? [],
    [delegations, searchText, undelegated]
  );
  const sliced = useMemo(
    () => data.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [data, page, pageSize]
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
                            undelegate(x.delegatee, activeUser.username);
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
                page={page}
                onPageChange={(page: number) => setPage(page)}
              />
            </div>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
