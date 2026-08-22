"use client";

import React, { useMemo, useState } from "react";
import defaults from "@/defaults";
import { renderPostBody, setProxyBase } from "@ecency/render-helper";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import { FormControl } from "@ui/input";
import { Entry } from "@/entities";
import i18next from "i18next";
import { historySvg, tagSvg } from "@ui/svg";
import { getCommentHistoryQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { LinearProgress } from "@/features/shared";
import { dateToFormatted } from "@/utils";
import { classNameObject } from "@ui/util";
import { useHistoryList } from "@/features/shared/edit-history/hooks";

setProxyBase(defaults.imageServer);

interface Props {
  entry: Entry;
  onHide: () => void;
}

export function EditHistory({ onHide, entry }: Props) {
  const [showDiff, setShowDiff] = useState(true);
  const [selected, setSelected] = useState(1);

  const { isLoading } = useQuery(
    getCommentHistoryQueryOptions(entry.author, entry.permlink, false)
  );
  const history = useHistoryList(entry);

  const selectedItem = useMemo(() => history.find((x) => x.v === selected), [history, selected]);

  return (
    <Modal show={true} centered={true} onHide={onHide} className="edit-history-dialog" size="lg">
      <ModalHeader closeButton={true}>
        <ModalTitle>{i18next.t("edit-history.title")}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        {isLoading && (
          <div className="edit-history-dialog-content loading">
            <LinearProgress />
          </div>
        )}

        {!isLoading && selectedItem && (
          <div className="edit-history-dialog-content">
            <div className="version-list-sm">
              <div className="diff-select">
                <label>
                  <input
                    type="checkbox"
                    checked={showDiff}
                    onChange={(e) => setShowDiff(e.target.checked)}
                  />{" "}
                  {i18next.t("edit-history.show-diff")}
                </label>
              </div>
              <FormControl
                type="select"
                value={selected}
                onChange={(e) => setSelected(+(e.target as any).value)}
              >
                {history.map((i) => {
                  return (
                    <option value={i.v} key={i.v}>
                      {" "}
                      {i18next.t("edit-history.version", { n: i.v })}
                    </option>
                  );
                })}
              </FormControl>
            </div>
            <div className="version-list-lg">
              <div className="diff-select">
                <label>
                  <input
                    type="checkbox"
                    checked={showDiff}
                    onChange={(e) => setShowDiff(e.target.checked)}
                  />{" "}
                  {i18next.t("edit-history.show-diff")}
                </label>
              </div>
              {history.map((i) => {
                return (
                  <div
                    key={i.v}
                    className={classNameObject({
                      "version-list-item": true,
                      selected: selected === i.v
                    })}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected === i.v}
                    onClick={() => setSelected(i.v)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(i.v);
                      }
                    }}
                  >
                    <div className="item-icon [&>svg]:size-5">{historySvg}</div>
                    <div className="item-title">
                      {i18next.t("edit-history.version", { n: i.v })}
                    </div>
                    <div className="item-date">{dateToFormatted(i.timestamp, "LLL")}</div>
                  </div>
                );
              })}
            </div>
            <div className="version-detail">
              <h1
                className="entry-title"
                dangerouslySetInnerHTML={{
                  __html: showDiff ? selectedItem.titleDiff! : selectedItem.title
                }}
              />
              <div className="entry-tags [&>svg]:size-4">
                {tagSvg}{" "}
                <span
                  dangerouslySetInnerHTML={{
                    __html: showDiff ? selectedItem.tagsDiff! : selectedItem.tags
                  }}
                />
              </div>
              <div
                className="entry-body markdown-view"
                dangerouslySetInnerHTML={{
                  __html: showDiff ? selectedItem.bodyDiff! : renderPostBody(selectedItem.body)
                }}
              />
            </div>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
