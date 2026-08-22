import React from "react";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import { Entry } from "@/entities";
import {
  makeShareUrlFacebook,
  makeShareUrlLinkedin,
  makeShareUrlReddit,
  makeShareUrlDiscord,
  makeShareUrlChats,
  makeShareUrlWaves,
  makeShareUrlTwitter
} from "@/utils/url-share";
import i18next from "i18next";
import {
  facebookSvg,
  discordSvg,
  linkedinSvg,
  redditSvg,
  twitterSvg,
  wavesSvg
} from "@ui/svg";
import { chatSvg } from "@/assets/img/svg";

interface Props {
  entry: Entry;
  onHide: () => void;
}

export const shareReddit = (entry: Entry) => {
  const u = makeShareUrlReddit(entry.category, entry.author, entry.permlink, entry.title);
  window.open(u, "_blank");
};

export const shareTwitter = (entry: Entry) => {
  const u = makeShareUrlTwitter(entry.category, entry.author, entry.permlink, entry.title);
  window.open(u, "_blank");
};

export const shareFacebook = (entry: Entry) => {
  const u = makeShareUrlFacebook(entry.category, entry.author, entry.permlink);
  window.open(u, "_blank");
};

export const shareLinkedin = (entry: Entry) => {
  const u = makeShareUrlLinkedin(entry.category, entry.author, entry.permlink);
  window.open(u, "_blank");
};

export const shareDiscord = (entry: Entry) => {
  const u = makeShareUrlDiscord(entry.category, entry.author, entry.permlink, entry.title);
  window.open(u, "_blank");
};

export const shareChats = (entry: Entry) => {
  const u = makeShareUrlChats(entry.category, entry.author, entry.permlink, entry.title);
  window.open(u, "_blank");
};

export const shareWaves = (entry: Entry) => {
  const u = makeShareUrlWaves(entry.category, entry.author, entry.permlink, entry.title);
  window.open(u, "_blank");
};

export function EntryShare({ entry, onHide }: Props) {
  const reddit = () => shareReddit(entry);
  const twitter = () => shareTwitter(entry);
  const facebook = () => shareFacebook(entry);
  const linkedin = () => shareLinkedin(entry);
  const discord = () => shareDiscord(entry);
  const chats = () => shareChats(entry);
  const waves = () => shareWaves(entry);

  return (
    <Modal show={true} centered={true} onHide={onHide} className="entry-share-dialog">
      <ModalHeader closeButton={true}>
        <ModalTitle>{i18next.t("entry-share.title")}</ModalTitle>
      </ModalHeader>
      <ModalBody className="entry-share-modal-body">
        <div className="share-buttons">
          <div
            className="share-button"
            role="button"
            tabIndex={0}
            aria-label="Reddit"
            onClick={reddit}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                reddit();
              }
            }}
          >
            {redditSvg}
          </div>
          <div
            className="share-button"
            role="button"
            tabIndex={0}
            aria-label="Twitter"
            onClick={twitter}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                twitter();
              }
            }}
          >
            {twitterSvg}
          </div>
          <div
            className="share-button"
            role="button"
            tabIndex={0}
            aria-label="Facebook"
            onClick={facebook}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                facebook();
              }
            }}
          >
            {facebookSvg}
          </div>
          <div
            className="share-button"
            role="button"
            tabIndex={0}
            aria-label="LinkedIn"
            onClick={linkedin}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                linkedin();
              }
            }}
          >
            {linkedinSvg}
          </div>
          <div
            className="share-button"
            role="button"
            tabIndex={0}
            aria-label="Discord"
            onClick={discord}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                discord();
              }
            }}
          >
            {discordSvg}
          </div>
          <div
            className="share-button"
            role="button"
            tabIndex={0}
            aria-label={i18next.t("chat.title", { defaultValue: "Chats" })}
            onClick={chats}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                chats();
              }
            }}
          >
            {chatSvg}
          </div>
          <div
            className="share-button"
            role="button"
            tabIndex={0}
            aria-label={i18next.t("waves.title", { defaultValue: "Waves" })}
            onClick={waves}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                waves();
              }
            }}
          >
            {wavesSvg}
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
