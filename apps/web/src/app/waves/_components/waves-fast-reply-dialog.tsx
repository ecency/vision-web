import { Modal, ModalHeader } from "@ui/modal";
import i18next from "i18next";
import { WaveEntry } from "@/entities";
import { WaveForm } from "@/features/waves";
import { WavesListItem } from "@/app/waves/_components/waves-list-item";
import { WaveViewDiscussion } from "@/app/waves/[author]/[permlink]/_components/wave-view-discussion";
import { useRouter } from "next/navigation";
import { entryKey } from "@ecency/sdk";

interface Props {
  show: boolean;
  onHide: () => void;
  entry?: WaveEntry;
}

export function WavesFastReplyDialog({ show, onHide, entry }: Props) {
  const router = useRouter();

  return (
    <Modal size="lg" centered={true} show={show} onHide={onHide}>
      <ModalHeader closeButton={true}>
        <div>
          {i18next.t("waves.reply-to")}
          <span className="text-blue-dark-sky ml-1">@{entry?.author}</span>
        </div>
      </ModalHeader>
      {entry && <WavesListItem key={entryKey(entry!)} interactable={false} item={entry} i={0} />}
      <WaveForm
        entry={undefined}
        replySource={entry}
        onSuccess={() => {
          onHide();
          router.refresh();
        }}
      />
      {entry &&
        <div className="flex flex-col gap-4">
            <WaveViewDiscussion entry={entry} />
        </div>
      }
    </Modal>
  );
}
