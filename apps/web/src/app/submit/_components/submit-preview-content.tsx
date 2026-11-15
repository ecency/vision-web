import React from "react";
import { SubmitPollPreview } from "./submit-poll-preview";
import { TagLink } from "@/features/shared/tag";
import { PostBodyLazyRenderer } from "@/app/submit/_components/post-body-lazy-renderer";

interface Props {
  title: string;
  tags: string[];
  body: string;
}

export function SubmitPreviewContent({ title, tags, body }: Props) {
  return (
    <>
      <div className="preview-title">{title}</div>

      <div className="preview-tags">
        {tags.map((x) => {
          return (
            <span className="preview-tag" key={x}>
              <TagLink tag={x} type="span">
                <span>{x}</span>
              </TagLink>
            </span>
          );
        })}
      </div>

      <div className="preview-body markdown-view er-youtube-source-host">
        <PostBodyLazyRenderer rawBody={body} />
        <SubmitPollPreview />
      </div>
    </>
  );
}
