import React, { useMemo, useState } from "react";
import type { AssetSymbol } from "@ecency/sdk";
import "./_index.scss";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import { Table, Td, Th, Tr } from "@ui/table";
import i18next from "i18next";
import { Pagination, Tooltip } from "@ui/index";
import { dateToFormatted, dateToFullRelative, formattedNumber } from "@/utils";
import { getSavingsWithdrawFromQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { LinearProgress } from "@/features/shared";

interface Props {
  tokenType: AssetSymbol;
  username: string;
  onHide: () => void;
}

/** Pending savings withdrawals of `username` for one token (HIVE or HBD). */
function usePendingSavingsWithdrawals(username: string, tokenType: AssetSymbol) {
  const { data, isLoading } = useQuery({
    ...getSavingsWithdrawFromQueryOptions(username),
    enabled: !!username
  });
  // Amounts are "1.000 HIVE" / "1.000 HBD": match the symbol exactly, not as a substring.
  const requests = useMemo(
    () => (data ?? []).filter((x) => x.amount.split(" ")[1] === tokenType),
    [data, tokenType]
  );
  return { requests, isLoading };
}

/**
 * A link under the wallet savings balance that opens the pending withdrawals list.
 * Renders nothing while there are no pending withdrawals for the token.
 */
export function SavingsWithdrawPendingLink({
  username,
  tokenType
}: Pick<Props, "username" | "tokenType">) {
  const { requests } = usePendingSavingsWithdrawals(username, tokenType);
  const [show, setShow] = useState(false);

  if (requests.length === 0) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="self-start text-sm text-blue-dark-sky hover:underline"
        onClick={() => setShow(true)}
      >
        {i18next.t("savings-withdraw.pending-link", { n: requests.length })}
      </button>
      {show && (
        <SavingsWithdraw username={username} tokenType={tokenType} onHide={() => setShow(false)} />
      )}
    </>
  );
}

export function SavingsWithdraw({ onHide, tokenType, username }: Props) {
  const { requests: savingWithdraw, isLoading } = usePendingSavingsWithdrawals(
    username,
    tokenType
  );

  const [pageSize, setPageSize] = useState(8);
  const [page, setPage] = useState(1);

  const sliced = useMemo(
    () => savingWithdraw.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [page, pageSize, savingWithdraw]
  );

  return (
    <Modal onHide={onHide} show={true} centered={true}>
      <ModalHeader closeButton={true}>
        <ModalTitle>{i18next.t("savings-withdraw.title")}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        {isLoading && <LinearProgress />}
        {!isLoading && (
          <div className="savings-withdraw-content">
            <div className="list-body">
              {sliced.length === 0 && <div className="empty-list">{i18next.t("g.empty-list")}</div>}
              <Table full={true}>
                <thead>
                  <Tr>
                    <Th>{i18next.t("conversion-requests.request-id")}</Th>
                    <Th>{i18next.t("conversion-requests.amount")}</Th>
                    <Th>{i18next.t("savings-withdraw.to")}</Th>
                    <Th>{i18next.t("conversion-requests.pending")}</Th>
                  </Tr>
                </thead>
                <tbody>
                  {sliced.map((x) => {
                    const { request_id } = x;
                    const publishedT = dateToFormatted(x.complete);
                    const published = dateToFullRelative(x.complete);
                    return (
                      <Tr key={request_id}>
                        <Td>{request_id}</Td>
                        <Td>
                          <Tooltip content={x.amount}>
                            <span>
                              {tokenType == "HBD"
                                ? formattedNumber(x.amount, { prefix: "$" })
                                : formattedNumber(x.amount, { suffix: tokenType })}
                            </span>
                          </Tooltip>
                        </Td>
                        <Td>
                          <Tooltip content={x.to}>
                            <span>{`@${x.to}`}</span>
                          </Tooltip>
                        </Td>
                        <Td>
                          <div className="date" title={publishedT}>
                            {published}
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>

            <Pagination
              className="mt-4"
              dataLength={savingWithdraw.length}
              pageSize={pageSize}
              maxItems={4}
              page={page}
              onPageChange={(page: number) => setPage(page)}
            />
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
