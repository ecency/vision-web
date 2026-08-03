import clsx from 'clsx';

/**
 * A status message a screen reader is told about when it changes.
 *
 * The first live region in this app. It exists because the join button conveys
 * its two failure outcomes, "we could not confirm this" and "the broadcast
 * failed", purely by text appearing while a button goes disabled, which a
 * screen reader user is never told about at all.
 *
 * Deliberately small, and there is one rule in it worth stating because getting
 * it wrong is silent: the region has to already be in the accessibility tree
 * before the message arrives. A region that is mounted at the same moment as
 * its first message is usually not announced. So callers render this
 * unconditionally and pass `message={null}` when there is nothing to say, and
 * the empty element renders no box of its own.
 *
 * `polite` waits for a pause in whatever the reader is saying. `assertive`
 * interrupts, and is for things that went wrong.
 */
interface Props {
  /** Null or empty renders nothing and announces nothing. */
  message: string | null;
  urgency?: 'polite' | 'assertive';
  /** Applied only when there is a message, so the region takes no space empty. */
  className?: string;
}

export function LiveRegion({ message, urgency = 'polite', className }: Props) {
  return (
    <span
      // role and aria-live agree on purpose: some readers key off one, some off
      // the other, and disagreeing is a way to be announced twice.
      role={urgency === 'assertive' ? 'alert' : 'status'}
      aria-live={urgency}
      className={clsx(message ? className : undefined)}
    >
      {message}
    </span>
  );
}
