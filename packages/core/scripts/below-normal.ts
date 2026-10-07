// このプロセスの優先度を「通常以下」に下げる。録画の解析などをゲームと並べて回しても、ゲームの邪魔をしないようにする。
// 子（ffmpeg・git・node）は親の優先度を受け継ぐ（Windows は親が通常以下のとき、ほかの OS は nice 値）。
// CLI の入口（node で直に起動するスクリプト）の先頭で import する。
import { constants, setPriority } from 'node:os';

try {
  setPriority(constants.priority.PRIORITY_BELOW_NORMAL);
} catch {
  // 下げられない環境では、通常の優先度のまま動かす。
}
