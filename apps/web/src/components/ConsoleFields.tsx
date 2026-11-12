// リサイクルルーム（コンソール）の研究の Lv の欄: 共通・クラス・企業。共通育成の詳細設定（TeamSettingsForm.tsx）と、
// 育成状況の編集のアカウント全体（RosterEditModal.tsx）で使う
import { CLASS_LABEL } from '../skillLabels.ts';
import { CONSOLE_CLASSES, CONSOLE_CORPORATIONS, CORPORATION_LABEL, type ConsoleInput } from '../team.ts';
import { IntInput } from './IntInput.tsx';

type Props = {
  value: ConsoleInput;
  disabled?: boolean;
  onChange: (next: ConsoleInput) => void;
};

export function ConsoleFields({ value, disabled = false, onChange }: Props) {
  const levelField = (key: string, label: string, level: number, onLevel: (lv: number) => void) => (
    <label key={key} className="field">
      <span>{label}</span>
      <IntInput value={level} min={0} disabled={disabled} onCommit={onLevel} />
    </label>
  );
  return (
    <div className="console-grid">
      {levelField('personal', '共通', value.personal, (lv) => onChange({ ...value, personal: lv }))}
      {CONSOLE_CLASSES.map((c) =>
        levelField(`class-${c}`, CLASS_LABEL[c], value.class[c], (lv) =>
          onChange({ ...value, class: { ...value.class, [c]: lv } }),
        ),
      )}
      {CONSOLE_CORPORATIONS.map((c) =>
        levelField(`corp-${c}`, CORPORATION_LABEL[c], value.corporation[c], (lv) =>
          onChange({ ...value, corporation: { ...value.corporation, [c]: lv } }),
        ),
      )}
    </div>
  );
}
