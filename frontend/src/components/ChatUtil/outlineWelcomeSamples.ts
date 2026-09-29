/**
 * 大纲构思欢迎样例：知识库 / 智能共用，避免两边文案与定框口径漂移。
 * 样例 content 只用于抽出「主题是【…】」；点选后走定框，不直接开跑。
 * 附加约束（如 GJB）必须写进主题字符串内。
 */
import {ButtonMessage} from "@/components/ChatUtil/ChatControlBar";
import {
  composeDocOutlineUserMessage,
  composePptOutlineUserMessage,
} from "@/components/ChatUtil/OutlinePromptComposer";

/** 文章大纲构思欢迎样例（Kb / Ai 共用） */
export const DOC_OUTLINE_WELCOME_SAMPLES: ButtonMessage[] = [
  {
    title: "",
    content: composeDocOutlineUserMessage(
      "抖音商务男装衬衫/polo衫爆品选品分析（采样时间20240319-20240417）",
    ),
  },
  {
    title: "",
    content: composeDocOutlineUserMessage("万科怎么了"),
  },
  {
    title: "",
    content: composeDocOutlineUserMessage(
      "研制总结报告（深空探测图谱项目，遵循GJB438B）",
    ),
  },
  {
    title: "",
    content: composeDocOutlineUserMessage("2024年男装流行趋势如何"),
  },
];

/** PPT 大纲构思欢迎样例（Kb / Ai 共用） */
export const PPT_OUTLINE_WELCOME_SAMPLES: ButtonMessage[] = [
  {
    title: "",
    content: composePptOutlineUserMessage(
      "帮助选品师，通过采样时间20240319-20240417的数据筛选抖音商务男装衬衫/polo衫爆品",
      {
        role: "选品师",
        object: "商务男装衬衫/polo衫爆品",
        scope: "商务男装衬衫/polo衫",
        domainPack: "selection",
      },
    ),
  },
  {
    title: "",
    content: composePptOutlineUserMessage(
      "深空探测图谱项目研制总结报告（遵循GJB438B）",
      {
        role: "研制人员",
        object: "深空探测图谱项目研制总结报告",
        scope: "",
        domainPack: "report",
      },
    ),
  },
  {
    title: "",
    content: composePptOutlineUserMessage("万科怎么了", {
      role: "读者",
      object: "万科怎么了",
      scope: "",
      domainPack: "generic",
    }),
  },
];
