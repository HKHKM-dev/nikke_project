// 取った番号を押さえる（records:new と tools/captures/intake.ts が使う）。並行するセッションに見えるのは origin だけなので、取った番号は
// push するまでほかのブランチと重なりうる（plan/design-workflow-simplification.md 4 節）。既定で、作ったファイルだけを commit して
// git push -u origin HEAD する（--no-push のときと、main の上やブランチが無いときはしない。plan/design-workflow-simplification-2.md 6 節）。
// 失敗しても作ったファイルは残す。
import { execFileSync } from 'node:child_process';
import { ROOT } from './records-data.ts';

/** paths は ROOT の下の絶対パスか、ROOT からの相対パス。label は番号の並び（「V-0501」「録画 0640〜0644」など） */
export function reserve(paths: readonly string[], label: string, push: boolean): void {
  const rels = paths.map((p) => (p.startsWith(ROOT) ? p.slice(ROOT.length) : p));
  const list = rels.join('・');
  if (!push) {
    console.log(`${label} はまだほかのブランチから見えない。${list} を commit して、すぐ push する（PR は出さない）`);
    return;
  }
  const git = (a: string[]): string =>
    execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let branch = '';
  try {
    branch = git(['symbolic-ref', '--short', '-q', 'HEAD']);
  } catch {
    // ブランチが無い（detached HEAD）
  }
  if (branch === '' || branch === 'main') {
    console.log(
      `注意: ${branch === '' ? 'ブランチが無い' : 'main の上にいる'}ので push しなかった。トピックブランチで ${list} を commit して push する`,
    );
    return;
  }
  try {
    git(['add', '--', ...rels]);
    git(['commit', '--quiet', '-m', `${label} の番号を押さえる`, '--', ...rels]);
  } catch (e) {
    console.log(
      `注意: commit できなかった（${(e as Error).message.split('\n')[0]}）。${list} を commit して push する`,
    );
    return;
  }
  try {
    git(['push', '--quiet', '-u', 'origin', 'HEAD']);
    console.log(`${list} を commit して origin/${branch} に push した（${label} がほかのブランチから見える）`);
  } catch (e) {
    console.log(
      `注意: push できなかった（${(e as Error).message.split('\n')[0]}）。commit はしたので、git push -u origin HEAD を回す`,
    );
  }
}
