import htmlParse, { domToReact, type DOMNode, type HTMLReactParserOptions } from "html-react-parser";
import type { Element } from "domhandler";
import React from "react";

// Only text and bare <mark> elements: a <mark> keeps its children and loses
// every attribute (a style or handler in the highlighted text must not reach
// the page). Matched by type and name, not instanceof: a second copy of
// domhandler (an ESM and a CJS build side by side) fails instanceof and
// dropped every <mark>.
const options: HTMLReactParserOptions = {
  replace: (domNode) => {
    if (domNode.type === "text") {
      return domNode;
    }
    if (domNode.type === "tag" && (domNode as Element).name === "mark") {
      return <mark>{domToReact((domNode as Element).children as DOMNode[], options)}</mark>;
    }
    return <></>;
  }
};

export const transformMarkedContent = (content: string) => htmlParse(content, options);
