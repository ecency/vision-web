import { AnyExtension } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Mention from "@tiptap/extension-mention";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import StarterKit from "@tiptap/starter-kit";

import {
  HivePostExtension,
  LoomVideoExtension,
  ThreeSpeakVideoExtension,
  YoutubeVideoExtension
} from "@/features/tiptap-editor/extensions";

/**
 * The nodes the publish editor really has, for specs that assert what the editor
 * ends up showing.
 *
 * ⚠️ A subset schema gives WRONG answers in both directions: a node the spec is
 * missing makes perfectly good content look like a crash, and a guard naming a
 * node the spec lacks can never be verified. That has already bitten twice, once
 * for `image` and once for the four embeds below. Keep this in step with
 * app/publish/_hooks/use-publish-editor.ts.
 *
 * The real embed extensions are imported rather than stubbed so their parse rules
 * cannot drift from production. Extensions that add no node or mark (Placeholder,
 * TextAlign, Selection) are left out; the marks the editor adds are not exercised
 * by the paste-normalisation specs.
 */
export const PUBLISH_EDITOR_EXTENSIONS: AnyExtension[] = [
  StarterKit.configure({ strike: false }) as AnyExtension,
  Image.configure({ inline: true }),
  Table,
  TableRow,
  TableCell,
  TableHeader,
  Mention,
  Mention.extend({ name: "tag", priority: 102 }),
  YoutubeVideoExtension,
  ThreeSpeakVideoExtension,
  LoomVideoExtension,
  HivePostExtension
];
