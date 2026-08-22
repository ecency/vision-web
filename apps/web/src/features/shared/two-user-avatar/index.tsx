import defaults from "@/defaults";
interface Props {
  from: string;
  to: string;
  size?: string;
}

export function TwoUserAvatar({ size, to, from }: Props) {
  const imgSize =
    size === "xLarge" ? "large" : size === "normal" || size === "small" ? "small" : "medium";
  const cls = `two-user-avatar ${size}`;
  const imageSrc1 = `${defaults.imageServer}/u/${from}/avatar/${imgSize}`;
  const imageSrc2 = `${defaults.imageServer}/u/${to}/avatar/${imgSize}`;

  return (
    <div className="route flex">
      <span className={cls} style={{ backgroundImage: `url(${imageSrc1})` }} />
      <span className={cls} style={{ backgroundImage: `url(${imageSrc2})` }} />
    </div>
  );
}
