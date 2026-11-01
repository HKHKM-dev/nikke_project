// 描画中の例外で画面全体が外れないようにする。main.tsx が画面全体を、App.tsx が結果の欄を包む。
// 結果の欄は、resetKeys（計算の結果と、詳細情報表示の切り替え）のどれかが変われば描き直す（次の結果で直るものは、入力を直せば戻る）
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { sameKeys } from '../resetKeys.ts';

type Props = {
  children: ReactNode;
  /** 落ちたときに代わりに出すもの */
  fallback: (error: Error) => ReactNode;
  /** このどれかが変わったら（要素ごとに Object.is で比べる）、落ちた状態を解いて children を描き直す */
  resetKeys?: readonly unknown[];
};

type State = { error: Error | null; resetKeys: readonly unknown[] };

const NO_KEYS: readonly unknown[] = [];

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, resetKeys: this.props.resetKeys ?? NO_KEYS };

  static getDerivedStateFromError(e: unknown): Partial<State> {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    const keys = props.resetKeys ?? NO_KEYS;
    return sameKeys(keys, state.resetKeys) ? null : { error: null, resetKeys: keys };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  override render(): ReactNode {
    return this.state.error === null ? this.props.children : this.props.fallback(this.state.error);
  }
}
