import type { ReactNode } from "react";
import i18next from "i18next";
import { Modal, ModalBody } from "@ui/modal";
import { ProfileLink, UserAvatar } from "@/features/shared";

export interface PeopleListEntry {
  id: string;
  /** Absent while the person's record has not loaded yet. */
  username?: string;
  displayName: string;
}

export interface PeopleListSection {
  key: string;
  heading?: ReactNode;
  people: PeopleListEntry[];
}

interface PeopleListModalProps {
  show: boolean;
  onHide: () => void;
  title: ReactNode;
  sections: PeopleListSection[];
}

/** A list of people, optionally in sections, each linking to their profile. */
export function PeopleListModal({ show, onHide, title, sections }: PeopleListModalProps) {
  return (
    <Modal show={show} onHide={onHide} centered size="sm">
      <ModalBody>
        <div className="flex items-center justify-between gap-2 pb-3">
          <div className="text-sm font-semibold">{title}</div>
          <button
            type="button"
            onClick={onHide}
            className="text-[--text-muted] hover:text-[--text-color]"
            aria-label={i18next.t("g.close")}
          >
            ×
          </button>
        </div>
        <div className="max-h-80 space-y-3 overflow-y-auto">
          {sections.map((section) => (
            <div key={section.key} className="space-y-1">
              {section.heading && (
                <div className="flex items-center gap-2 px-2 text-xs text-[--text-muted]">{section.heading}</div>
              )}
              {section.people.map((person) =>
                person.username ? (
                  <ProfileLink
                    key={person.id}
                    username={person.username}
                    afterClick={onHide}
                    className="flex items-center gap-2 rounded px-2 py-1 hover:bg-[--background-color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-dark-sky"
                  >
                    <UserAvatar username={person.username} size="small" />
                    <div className="min-w-0">
                      <div className="truncate text-sm">{person.displayName}</div>
                      <div className="truncate text-[11px] text-[--text-muted]">@{person.username}</div>
                    </div>
                  </ProfileLink>
                ) : (
                  <div key={person.id} className="flex items-center gap-2 rounded px-2 py-1">
                    <div className="size-7 rounded-full bg-[--background-color]" />
                    <div className="truncate text-sm text-[--text-muted]">{person.displayName}</div>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      </ModalBody>
    </Modal>
  );
}
