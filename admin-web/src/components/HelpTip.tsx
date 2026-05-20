import { HELP_TEXTS } from '../lib/labels';

type Props = {
  topic: keyof typeof HELP_TEXTS | string;
  text?: string;
};

export default function HelpTip({ topic, text }: Props) {
  const content = text ?? HELP_TEXTS[topic] ?? topic;
  return (
    <span
      className="help-tip"
      title={content}
      aria-label={content}
      role="img"
    >
      ?
    </span>
  );
}
