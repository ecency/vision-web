import type { PropsWithChildren } from 'react';

/**
 * The reading measure inside the shared shell. `max-w-3xl` stays the width
 * every template has always had; `blog-page-measure` is a styling hook so a
 * theme whose archive is not a column of text (Gallery's grid of covers) can
 * widen it from its own stylesheet without changing anyone else's measure.
 */
export function BlogPage(props: PropsWithChildren) {
  return (
    <div className="blog-page-measure max-w-3xl mx-auto w-full">
      {props.children}
    </div>
  );
}
