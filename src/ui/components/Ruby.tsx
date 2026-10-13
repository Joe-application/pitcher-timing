import { Fragment } from 'react';

/** "{漢字|かんじ}" の書き方を <ruby> に変換して表示する */
export function R({ children }: { children: string }) {
  const parts: React.ReactNode[] = [];
  const re = /\{([^|{}]+)\|([^|{}]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(children))) {
    if (m.index > last) parts.push(<Fragment key={i++}>{children.slice(last, m.index)}</Fragment>);
    parts.push(
      <ruby key={i++}>
        {m[1]}
        <rt>{m[2]}</rt>
      </ruby>,
    );
    last = m.index + m[0].length;
  }
  if (last < children.length) parts.push(<Fragment key={i++}>{children.slice(last)}</Fragment>);
  return <>{parts}</>;
}

/** ふりがな記法を取り除いた文字列（title 属性などに使う） */
export const plain = (s: string) => s.replace(/\{([^|{}]+)\|[^|{}]+\}/g, '$1');
