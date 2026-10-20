/**
 * 三十四：构思页库上下文 UI 分流（纯函数，可测；勿依赖 antd）
 */
import {ALL_KB_NAME} from "@/components/DocUtil/kbCache";

export function outlineKbBindUi(kbName?: string, showVars = true) {
  const hasKbContext = Boolean(kbName);
  const isAllKb = hasKbContext && kbName === ALL_KB_NAME;
  const canBindFiles = hasKbContext && !isAllKb && !!showVars;
  return {
    hasKbContext,
    isAllKb,
    canBindFiles,
    /** 有库但不可绑文档 → 显示全库/未具体库 Alert */
    showAllKbAlert: hasKbContext && !canBindFiles,
  };
}
