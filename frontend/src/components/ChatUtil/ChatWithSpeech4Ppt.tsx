import {ProChat, ProChatProvider, useProChat} from "@ant-design/pro-chat";
import {ButtonMessage} from "@/components/ChatUtil/ChatControlBar";
import {sampleLabel} from "@/components/ChatUtil/sampleLabel";
import {Button, Progress, Space, Typography, message} from "antd";
import {clean4PptTitle, isPlaceholderPptOutlineTitle, Ppt} from "@/components/DocUtil/ViewItem4Ppt";
import OutlineRec, {
  outlineType,
  outlineTypePPT
} from "@/components/DocUtil/OutlineStore";
import SpeechToTextButton from "@/components/DocUtil/SpeechToTextButton";
import {OpenAI} from "openai";
import * as React from "react";
import welcomeStyles from "./ChatWelcome.less";
import OutlinePromptComposer, {
  OutlineSendPayload,
  PptDomainPack,
  buildPptOutlineLayoutAssignSystemPrompt,
  buildPptOutlineSlideFillSystemPrompt,
  buildPptOutlineStructureSystemPrompt,
  inferPptDomainPack,
  parseInferredVarsJson,
} from "@/components/ChatUtil/OutlinePromptComposer";
import {
  DEFAULT_LLM_MODEL,
  STRONG_FILL_LAYOUTS,
  STRONG_LLM_MODEL,
} from '@/constants/llm';
import {
  assistantContentToOutlineMarkdown,
  coerceLayoutBySlideTitle,
  filledToMarkdown,
  normalizeSlideLayout,
  parseFilledSlideFromModel,
  parseLayoutAssignFromModel,
  parseOutlineStructureFromModel,
  topicFromUserMessage,
  type OutlineFilledJson,
  type OutlineJsonLayout,
  type OutlineStructureJson,
} from "@/components/DocUtil/outlineJson";
import {inferSlideIntentOrUndefined} from "@/components/DocUtil/outlineEvidenceValidate";
import {
  buildCoverageChecklist,
  checkStructureCoverage,
} from "@/components/DocUtil/outlineCoverage";

interface ChatWithSpeechProps{
  openai:OpenAI;
  outlineType:outlineType;
  /** 功能名，用于欢迎词「专属XXXX机器人」 */
  featureName: string;
  /***
   kb_name:
   当outlineType是outlineTypeDOC、outlineTypePPT时需要，
   当outlineType是outlineTypeAiDOC、outlineTypeAiPPT时不需要，
   **/
  kb_name?:string;
  buttonMessages:ButtonMessage[],
  cb4setOutlineRec:(id:string)=>void,
  cb4setTempOutlineRecs:(ors:OutlineRec[])=>void,
}
interface ChatProps{
  openai:OpenAI;
  outlineType:outlineType;
  featureName: string;
  welcomeSamples: ButtonMessage[];
  /***
   kb_name:
   当outlineType是outlineTypeDOC、outlineTypePPT时需要，
   当outlineType是outlineTypeAiDOC、outlineTypeAiPPT时不需要，
   **/
  kb_name?:string;
  cb4setOutlineRec:(id:string)=>void,
  cb4setTempOutlineRecs:(ors:OutlineRec[])=>void,
}
const ChatWithSpeech4Ppt=(props:ChatWithSpeechProps)=>{
  const chatProps = {
    openai: props.openai,
    outlineType: props.outlineType,
    featureName: props.featureName,
    welcomeSamples: props.buttonMessages,
    cb4setOutlineRec: props.cb4setOutlineRec,
    cb4setTempOutlineRecs: props.cb4setTempOutlineRecs,
    ...(props.outlineType === outlineTypePPT ? { kb_name: props.kb_name } : {}),
  };
  return (
    <ProChatProvider>
      <Chat key="chat" {...chatProps} />
    </ProChatProvider>
  )
}
const Chat=(props:ChatProps)=> {
  const proChat = useProChat();
  const {kb_name,openai,outlineType,featureName,welcomeSamples,cb4setOutlineRec,cb4setTempOutlineRecs} =props
  const [topic, setTopic] = React.useState('');
  /** 领域包：两段流水线共用 */
  const pendingPackRef = React.useRef<PptDomainPack>('generic');
  /** 定框短显示名：存盘 / # 标题优先用它 */
  const pendingDisplayTitleRef = React.useRef('');
  /** 最近一次构思主题，保存大纲时回退用 */
  const lastTopicRef = React.useRef('');
  /** 大纲流水线进度：结构 / 章选型 / 按页填充 */
  const [outlineProgress, setOutlineProgress] = React.useState<{
    percent: number;
    label: string;
  } | null>(null);
  /** 欢迎区样例点击 → 递增以打开定框弹框 */
  const [previewSignal, setPreviewSignal] = React.useState(0);

  const rememberTopic = (text: string) => {
    const t = (text || '').trim();
    if (!t) return;
    lastTopicRef.current = t;
    setTopic(t);
  };

  const getTextFromMic = (text: string) => {
    console.log("麦克风识别文本:" + text);
    rememberTopic(text);
  }

  const sendOutline = (payload: OutlineSendPayload) => {
    pendingPackRef.current =
      payload.domainPack ||
      inferPptDomainPack(payload.userMessage || '', {}) ||
      'generic';
    pendingDisplayTitleRef.current = (payload.displayTitle || '').trim();
    const topicMatch = (payload.userMessage || '').match(/主题是【(.+?)】/);
    if (topicMatch?.[1]) rememberTopic(topicMatch[1]);
    else if (topic.trim()) lastTopicRef.current = topic.trim();
    proChat.sendMessage(payload.userMessage);
  };

  const sendSample = (sample: ButtonMessage) => {
    const content = (sample.content || '').trim();
    const topicMatch = content.match(/主题是【(.+?)】/);
    const topicText = topicMatch?.[1]?.trim() || sample.title || content.slice(0, 40);
    rememberTopic(topicText);
    // 走定框弹框，不要直接开跑
    setPreviewSignal((n) => n + 1);
  };

  const welcomeMessage = (
    <div className={welcomeStyles.welcomeBlock}>
      <div className={welcomeStyles.welcomeText}>
        {`欢迎使用 毕方 ，我是你的专属${featureName}机器人。`}
      </div>
      {welcomeSamples?.length > 0 && (
        <div className={welcomeStyles.welcomeSamples}>
          <div className={welcomeStyles.welcomeSamplesLabel}>你可以试着构思：</div>
          <Space wrap size={[8, 8]}>
            {welcomeSamples.map((sample, idx) => {
              const label = sampleLabel(sample.title, sample.content);
              return (
                <Button
                  key={`welcome-sample-${idx}`}
                  size="small"
                  className={welcomeStyles.sampleBtn}
                  onClick={() => sendSample(sample)}
                >
                  {label}
                </Button>
              );
            })}
          </Space>
        </div>
      )}
    </div>
  );

  return (
    <div style={{position: 'relative', minHeight: '82vh'}}>
      {outlineProgress && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            margin: '0 12px 8px',
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.96)',
            border: '1px solid #d6e4ff',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <Typography.Text type="secondary" style={{fontSize: 13}}>
            {outlineProgress.label}
          </Typography.Text>
          <Progress
            percent={outlineProgress.percent}
            status={outlineProgress.percent >= 100 ? 'success' : 'active'}
            size="small"
            style={{marginBottom: 0, marginTop: 6}}
          />
        </div>
      )}
    <ProChat
      style={{ minHeight: outlineProgress ? '76vh' : '82vh', background:"aliceblue" }}
      helloMessage={welcomeMessage}
      chatItemRenderConfig={{
        actionsRender: (props) => {
          const msg:string=props.message?.toString()===undefined?"":props.message?.toString();
          const role = (props as any)?.originData?.role;
          const placement = (props as any)?.placement;
          const isUser = role === "user" || placement === "right";
          if (isUser || props?.editing || msg.length<=150 || !msg.includes("##")) {
            return null;
          }
          return (
            <Button  key={"outlineSave"} size={"small"} style={{marginTop:"0.5em"}}
                    type="dashed"
                    onClick={(e) => {
                      console.log(e,props.message);
                      const preferredTitle =
                        (pendingDisplayTitleRef.current ||
                          lastTopicRef.current ||
                          topic ||
                          '').trim() ||
                        (() => {
                          try {
                            const chats = (proChat as any)?.getChatMessages?.() || [];
                            for (let i = chats.length - 1; i >= 0; i--) {
                              const c = String(chats[i]?.content || chats[i]?.message || '');
                              const m = c.match(/主题是【(.+?)】/);
                              if (m?.[1]?.trim()) return m[1].trim();
                            }
                          } catch { /* ignore */ }
                          return '';
                        })();
                      let content = assistantContentToOutlineMarkdown(
                        msg,
                        preferredTitle,
                      );
                      content = clean4PptTitle(content, preferredTitle);
                      let recTitle = Ppt.getTitleFromMsg(content);
                      if (isPlaceholderPptOutlineTitle(recTitle) && preferredTitle) {
                        recTitle = preferredTitle;
                        const body = Ppt.getContentFromMsg(content);
                        content = `# ${preferredTitle}\n${body}`.trim();
                      }
                      let recContent = Ppt.getContentFromMsg(content);
                      if (!recTitle || recTitle.length === 0) {
                        message.error("无法保存，大纲markdown格式有误,标题应该以【# 】开头并在第一行单独成行，请检查并修改。",20)
                        return;
                      }
                      const chapters=Ppt.getChaptersFromContent(recContent)
                      const t=Ppt.checkChapter(chapters);
                      if(t.code!==0){
                        message.error(t.msg, 20);
                        return;
                      }
                      // 扁结构拒存（JSON 流水线应已避免；Markdown 兜底仍拦）
                      const thin = chapters.filter((c) => (c.slides?.length || 0) < 2).length;
                      if (chapters.length >= 3 && thin >= Math.ceil(chapters.length * 0.6)) {
                        message.error(
                          `结构不合格：${chapters.length} 章中有 ${thin} 章不足 2 页。请重新构思（系统将先定标题树再填要点）。`,
                          20,
                        );
                        return;
                      }
                      message.success(t.msg)
                      let newPptOutlineRec=new OutlineRec(
                        recTitle,
                        recContent,
                        outlineType===outlineTypePPT ? (kb_name || "samples") : (kb_name || ""),
                        "",
                      );
                      console.log("the new OutlineRec:", JSON.stringify(newPptOutlineRec));
                      OutlineRec.save(outlineType,newPptOutlineRec)
                      cb4setOutlineRec(newPptOutlineRec.outlineId!);
                      let newRecs=OutlineRec.listRecs(outlineType, outlineType===outlineTypePPT ? (kb_name || "samples") : undefined)
                      cb4setTempOutlineRecs(newRecs);
                    }}
            >
              大纲保存
            </Button>
          );
        },
      }}
      actions={{
        render: (defaultDoms) => {
          return [
            <SpeechToTextButton key={"speech"} cb4textFn={getTextFromMic}/>,
            ...defaultDoms,
          ];
        },
        flexConfig: {
          gap: 24,
          direction: 'horizontal',
          justify: 'space-between',
        },
      }}
      inputAreaRender={(_defaultDom) => (
        <OutlinePromptComposer
          topic={topic}
          setTopic={setTopic}
          mode="ppt"
          onSend={sendOutline}
          showVars
          openPreviewSignal={previewSignal}
          inferVars={async (t) => {
            const completion = await openai.chat.completions.create({
              messages: [
                {
                  role: "system",
                  content:
                    "你从PPT主题里抽出三个短字段，只返回JSON：" +
                    '{"role":"岗位","object":"筛选或判断对象","scope":"短范围"}。' +
                    "scope 是品类/赛道短标签：优先主题里的具体品类对（如「商务男装衬衫/polo衫」「男装」），" +
                    "可用斜杠连接 1～2 个品类，≤20字；禁止顿号罗列细分类目清单；主题未写范围则 scope 用空字符串。" +
                    "不要解释，不要编造主题里没有的岗位。",
                },
                { role: "user", content: `主题：${t}` },
              ],
              model: DEFAULT_LLM_MODEL,
              stream: false,
              temperature: 0.2,
            } as any);
            const text = completion?.choices?.[0]?.message?.content || "";
            return parseInferredVarsJson(String(text));
          }}
        />
      )}
      request={async (messages: any) => {
        const pack = pendingPackRef.current || 'generic';
        const rest = (Array.isArray(messages) ? messages : []).filter(
          (m: any) => m?.role !== 'system',
        );
        const lastUser =
          [...rest].reverse().find((m: any) => m?.role === 'user')?.content || '';

        /** 按流水线步数估进度：1 结构 + 每章 1 选型 + 每页 1 填充 */
        let progressDone = 0;
        let progressTotal = 10; // 结构完成前未知总步数，先用占位
        const pipelineT0 = performance.now();
        const msSince = (t0: number) => Math.round(performance.now() - t0);
        const timing = {
          structureMs: 0,
          structureAttempts: 0,
          layoutMs: 0,
          layoutCalls: 0,
          fillMs: 0,
          fillCalls: 0,
          /** 忠实度闸拒次数（含重试中间失败） */
          fidelityRejects: 0,
          /** 曾被闸拒、最终仍过闸的页数 */
          fidelityRecovered: 0,
          llmCalls: [] as Array<{
            stage: string;
            title?: string;
            model: string;
            ms: number;
            ok: boolean;
          }>,
          slides: [] as Array<{
            chapter: string;
            title: string;
            layout: string;
            ms: number;
            attempts: number;
            ok: boolean;
          }>,
        };
        const logTimingSummary = (status: string) => {
          const totalMs = msSince(pipelineT0);
          const pct = (n: number) =>
            totalMs > 0 ? `${Math.round((n / totalMs) * 100)}%` : '0%';
          const byModel: Record<string, {ms: number; n: number}> = {};
          for (const c of timing.llmCalls) {
            const row = byModel[c.model] || (byModel[c.model] = {ms: 0, n: 0});
            row.ms += c.ms;
            row.n += 1;
          }
          const slowest = [...timing.llmCalls]
            .sort((a, b) => b.ms - a.ms)
            .slice(0, 8)
            .map((c) => ({
              stage: c.stage,
              title: c.title,
              model: c.model,
              sec: +(c.ms / 1000).toFixed(1),
              ok: c.ok,
            }));
          console.log('ppt-outline-timing', {
            status,
            totalSec: +(totalMs / 1000).toFixed(1),
            structureSec: +(timing.structureMs / 1000).toFixed(1),
            structurePct: pct(timing.structureMs),
            structureAttempts: timing.structureAttempts,
            layoutSec: +(timing.layoutMs / 1000).toFixed(1),
            layoutPct: pct(timing.layoutMs),
            layoutCalls: timing.layoutCalls,
            fillSec: +(timing.fillMs / 1000).toFixed(1),
            fillPct: pct(timing.fillMs),
            fillCalls: timing.fillCalls,
            fidelityRejects: timing.fidelityRejects,
            fidelityRecovered: timing.fidelityRecovered,
            fidelityNote:
              '误杀率观察：fidelityRejects 高且 recovered 低 → 少堆启发式，转 JSON 双轨',
            byModel: Object.fromEntries(
              Object.entries(byModel).map(([m, v]) => [
                m,
                {sec: +(v.ms / 1000).toFixed(1), calls: v.n, pct: pct(v.ms)},
              ]),
            ),
            slowest,
            slides: timing.slides.map((s) => ({
              ...s,
              sec: +(s.ms / 1000).toFixed(1),
            })),
          });
        };
        const reportProgress = (label: string, done = progressDone) => {
          const elapsedSec = Math.round(msSince(pipelineT0) / 1000);
          const percent = Math.min(
            99,
            Math.round((done / Math.max(progressTotal, 1)) * 100),
          );
          setOutlineProgress({
            percent,
            label: elapsedSec > 0 ? `${label}（已用 ${elapsedSec}s）` : label,
          });
        };
        const finishProgress = (label: string) => {
          setOutlineProgress({percent: 100, label});
          window.setTimeout(() => setOutlineProgress(null), 600);
        };
        const failProgress = () => setOutlineProgress(null);

        reportProgress('正在规划标题树…', 0);

        const chatOpts = {
          model: DEFAULT_LLM_MODEL,
          stream_options: {
            top_k: 4,
            temperature: 0.3,
            prompt_name: 'default',
            return_direct: false,
          },
        };

        const runOnce = async (sys: string, userContent: string) => {
          const t0 = performance.now();
          let ok = false;
          try {
            const completion = await openai.chat.completions.create({
              messages: [
                {role: 'system', content: sys},
                {role: 'user', content: userContent},
              ],
              model: chatOpts.model,
              stream: false,
              ...(chatOpts.stream_options as any),
            } as any);
            ok = true;
            return String(completion?.choices?.[0]?.message?.content || '');
          } finally {
            const ms = msSince(t0);
            timing.structureMs += ms;
            timing.structureAttempts += 1;
            timing.llmCalls.push({
              stage: 'structure',
              model: chatOpts.model,
              ms,
              ok,
            });
          }
        };

        // —— 第一段：只定标题树（可重试 2 次；含素材覆盖清单）——
        let structure: OutlineStructureJson | null = null;
        let structureErr = '';
        let lastRaw = '';
        const coverageList = buildCoverageChecklist(
          `${lastUser}\n${pendingDisplayTitleRef.current || ''}\n${lastTopicRef.current || ''}`,
        );
        for (let attempt = 0; attempt < 3 && !structure; attempt++) {
          reportProgress(
            attempt
              ? `标题树重试 ${attempt + 1}/3…`
              : '正在规划标题树…',
            0,
          );
          const sys = buildPptOutlineStructureSystemPrompt(pack);
          const hint = attempt
            ? `\n【重试】上一版不合格：${structureErr}。必须输出 JSON：chapters 恰好 3～5 个（推荐 4）；每个 chapter 含非空 title 与 subtitle；每章 slides 至少 2 项且只含 title（不要 layout/tips）。章标题禁止「先看/再看」口语。不要用 Markdown。`
            : '';
          try {
            const raw = await runOnce(sys, `${lastUser}${hint}`);
            lastRaw = raw;
            console.log('ppt-outline-structure-raw', attempt, raw?.slice?.(0, 500));
            const parsed = parseOutlineStructureFromModel(raw);
            if (parsed.ok) {
              const cov = checkStructureCoverage(parsed.value, coverageList);
              if (!cov.ok) {
                structureErr = cov.hint;
                console.log('ppt-outline-coverage-miss', cov.missing.map((m) => m.id));
              } else {
                structure = parsed.value;
              }
            } else structureErr = parsed.msg;
          } catch (e: any) {
            structureErr = e?.message || '结构生成失败';
          }
        }

        const encoder = new TextEncoder();
        if (!structure) {
          failProgress();
          logTimingSummary('structure-failed');
          const errText =
            `未能生成合格标题树（${structureErr || '未知错误'}）。` +
            `请换具体知识库（不要用「全部」）后重试，或简化主题。` +
            (lastRaw ? `\n\n（模型原文摘录）${String(lastRaw).slice(0, 180).replace(/\s+/g, ' ')}` : '');
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(errText));
                controller.close();
              },
            }),
          );
        }

        // 全文标题优先用定框短显示名，其次主题句
        const docTitle =
          (pendingDisplayTitleRef.current || '').trim() ||
          topicFromUserMessage(lastUser, lastTopicRef.current) ||
          structure.title ||
          '未命名大纲';
        structure = {...structure, title: docTitle};

        const chapterCount = structure.chapters.length;
        const slideCount = structure.chapters.reduce(
          (n, c) => n + (c.slides?.length || 0),
          0,
        );
        progressTotal = 1 + chapterCount + slideCount;
        progressDone = 1;
        reportProgress(
          `标题树已定（${chapterCount} 章 / ${slideCount} 页），开始选型与填充…`,
        );

        // —— 第二段：章内先选型，再按页填 tips（短契约；分栏走强模型；失败只重试该页）——
        const filledChapters: OutlineFilledJson['chapters'] = [];
        const strongLayouts = new Set<string>(STRONG_FILL_LAYOUTS);

        const runOnceWithModel = async (
          sys: string,
          userContent: string,
          model: string,
          meta: {stage: 'layout' | 'fill'; title?: string},
        ): Promise<{content: string; evidence: string}> => {
          const t0 = performance.now();
          let ok = false;
          try {
            // 用 fetch 拿完整 JSON，保留后端 docs（OpenAI SDK 会丢掉扩展字段）
            const base = String((openai as any)?.baseURL || '').replace(/\/?$/, '/');
            const apiKey = String((openai as any)?.apiKey || 'sk-local');
            const body: Record<string, unknown> = {
              messages: [
                {role: 'system', content: sys},
                {role: 'user', content: userContent},
              ],
              model,
              stream: false,
            };
            const so = chatOpts.stream_options as Record<string, unknown> | undefined;
            if (so && typeof so === 'object') {
              Object.assign(body, so);
              body.stream_options = so;
            }
            const res = await fetch(`${base}chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify(body),
            });
            if (!res.ok) {
              throw new Error(`chat/completions ${res.status}`);
            }
            const data = await res.json();
            ok = true;
            const content = String(
              data?.choices?.[0]?.message?.content ||
                data?.choices?.[0]?.delta?.content ||
                '',
            );
            const docs = data?.docs;
            let evidence = '';
            if (Array.isArray(docs)) {
              evidence = docs
                .map((d: any) => {
                  const body = String(
                    d?.content || d?.page_content || d?.text || '',
                  );
                  if (!body) return '';
                  const cid = d?.chunk_id ?? d?.chunk ?? '';
                  const page = d?.page ?? '';
                  return `⟦chunk:${cid}|page:${page}⟧\n${body}`;
                })
                .filter(Boolean)
                .join('\n\n');
            }
            return {content, evidence};
          } finally {
            const ms = msSince(t0);
            if (meta.stage === 'layout') {
              timing.layoutMs += ms;
              timing.layoutCalls += 1;
            } else {
              timing.fillMs += ms;
              timing.fillCalls += 1;
            }
            timing.llmCalls.push({
              stage: meta.stage,
              title: meta.title,
              model,
              ms,
              ok,
            });
          }
        };

        for (let ci = 0; ci < structure.chapters.length; ci++) {
          const ch = structure.chapters[ci];
          const lockedOne = JSON.stringify({
            title: docTitle,
            chapters: [ch],
          });

          // 2a) 只定 layout（默认模型）
          reportProgress(
            `章 ${ci + 1}/${chapterCount} 版式选型：${ch.title}`,
          );
          let layouts: OutlineJsonLayout[] | null = null;
          let intents: Array<string | undefined> = [];
          let layoutErr = '';
          for (let attempt = 0; attempt < 3 && !layouts; attempt++) {
            const laySys = buildPptOutlineLayoutAssignSystemPrompt(pack, lockedOne);
            const layUser =
              `${lastUser}\n只为本章每个 slide 选 layout，可选标注 intent（category-position|macro-market|category-detail|price-band），不要写 tips。` +
              `输出 {"slides":[{"title":"…","layout":"…","intent":"…"},…]}，顺序与锁定树一致；intent 拿不准可省略。` +
              (attempt
                ? `\n【重试】上一版不合格：${layoutErr}。注意总览+案例须 columns；禁止全章 list。`
                : '');
            try {
              const {content: raw} = await runOnceWithModel(
                laySys,
                layUser,
                DEFAULT_LLM_MODEL,
                {stage: 'layout', title: ch.title},
              );
              console.log('ppt-outline-layout-raw', ci, attempt, raw?.slice?.(0, 300));
              const parsed = parseLayoutAssignFromModel(raw, ch);
              if (parsed.ok) {
                layouts = parsed.layouts;
                // 选型省略 intent 时按标题回填，避免校验管道空转
                intents = ch.slides.map(
                  (s, i) =>
                    parsed.intents[i] || inferSlideIntentOrUndefined(s.title),
                );
              } else layoutErr = parsed.msg;
            } catch (e: any) {
              layoutErr = e?.message || '版式选型失败';
            }
          }
          if (!layouts) {
            failProgress();
            logTimingSummary('layout-failed');
            const errText =
              `大纲填充失败：章「${ch.title}」版式选型不合格` +
              (layoutErr ? `（${layoutErr}）` : '') +
              `。请换具体知识库后重试。`;
            console.warn('ppt-outline-layout-failed', ch.title, layoutErr);
            return new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(encoder.encode(errText));
                  controller.close();
                },
              }),
            );
          }

          progressDone += 1;
          // 标题轻量结构纠偏（问句枚举→list 等，无领域词表）
          layouts = layouts.map((lay, i) =>
            coerceLayoutBySlideTitle(ch.slides[i].title, lay),
          );
          reportProgress(
            `章 ${ci + 1}/${chapterCount} 选型完成，开始填要点…`,
          );

          // 2b) 按页填 tips：只发该 layout 细则；分栏/数据+分栏用强模型
          //    metric 抽不出原数字时降级 list/columns，避免整页卡死
          let siblingTitles = ch.slides
            .map((s, i) => `${i + 1}. ${s.title} → ${layouts![i]}`)
            .join('\n');
          const slidesOut: OutlineFilledJson['chapters'][0]['slides'] = ch.slides.map(
            (s, i) => ({
              title: s.title,
              layout: layouts![i],
              intent: intents[i],
              tips: [] as string[],
            }),
          );

          const isMetricScarceErr = (msg: string) =>
            /原数字|改用 list|勿用类目名充数据卡/.test(msg || '');
          const isColumnsEmptyErr = (msg: string) =>
            /分栏每栏至少|col:\s*不足|伪分栏|各栏条目数/.test(msg || '');
          /** tips 空/过少或未解析：任何复杂版式都降到 list 再填 */
          const isSparseTipsErr = (msg: string) =>
            /tips 不足|未解析到 tips|仍是占位句/.test(msg || '');

          for (let si = 0; si < ch.slides.length; si++) {
            const slTitle = ch.slides[si].title;
            const slideOrdinal =
              structure.chapters
                .slice(0, ci)
                .reduce((n, c) => n + c.slides.length, 0) +
              si +
              1;
            reportProgress(
              `填充要点 ${slideOrdinal}/${slideCount}：${slTitle}`,
            );
            let layout = coerceLayoutBySlideTitle(
              slTitle,
              normalizeSlideLayout(layouts![si]),
            );
            layouts![si] = layout;
            slidesOut[si] = {...slidesOut[si], layout};
            siblingTitles = ch.slides
              .map((s, i) => `${i + 1}. ${s.title} → ${layouts![i]}`)
              .join('\n');
            let filledSlide: OutlineFilledJson['chapters'][0]['slides'][0] | null =
              null;
            let fillErr = '';
            let downgraded = false;
            const slideT0 = performance.now();
            let fillAttempts = 0;
            let fidelityHitOnSlide = false;
            for (let attempt = 0; attempt < 4 && !filledSlide; attempt++) {
              // 重试升级强模型；分栏页从一开始就用强模型
              const preferStrong = strongLayouts.has(layout);
              const useStrong = preferStrong || attempt > 0 || downgraded;
              const model = useStrong ? STRONG_LLM_MODEL : DEFAULT_LLM_MODEL;
              const lockedSlide = JSON.stringify({
                title: slTitle,
                layout,
                ...(intents[si] ? {intent: intents[si]} : {}),
              });
              const fillSys = buildPptOutlineSlideFillSystemPrompt(
                pack,
                layout,
                siblingTitles,
                lockedSlide,
              );
              const fillUser =
                `【本页标题】\n${slTitle}\n\n` +
                `${lastUser}\n` +
                `只填充这一页 tips（layout 已锁定为 ${layout}）。` +
                `输出 {"title":"${slTitle}","layout":"${layout}","tips":[…]}，tips 至少 2 条非空字符串。` +
                `遵守系统里该 layout 的 tips 契约；贴本页标题，勿抢兄弟页；禁止输出空 tips。` +
                (layout === 'columns' || layout === 'metric_columns'
                  ? `分栏必须 2～4 栏：每条 tip 单独一行；\`col: 轴名\`(≤12字) 与栏内短条目分条输出，禁止把多行 - 条目塞进同一个 tip 字符串；总览栏内只写短标签。`
                  : '') +
                (fillErr && /重复要点|同文填两卡/.test(fillErr)
                  ? `\n【去重提示】各栏 colSub/副标允许省略：若两栏副标相同，删去其一即可（该栏留空）；正文短条目同文两卡则必须替换为材料中的不同事实。`
                  : '') +
                (fillErr && /张冠李戴|未对齐|大盘口径|点名口径|裸同比/.test(fillErr)
                  ? `\n【口径纠正】对照数字必须显式写明「大盘」或品类名，禁止裸数字对照（如「7280.1万 vs 296.2万」）。` +
                    `分栏页把同比/环比写在对应 \`col: 衬衫\` / \`col: polo\` 栏下，勿单独丢一条无口径的「同比+xx%」。` +
                    `注意大盘与品类销量通常差 1～2 个数量级，勿互换口径。` +
                    `本页若为品类位置/对照：可用大盘数，但 tip 须标「大盘/总销量」，且同页至少还有衬衫或 polo 的品类数字。`
                  : '') +
                (downgraded
                  ? `\n【已降级】已改为 ${layout}，按新版式写 tips，必须写出 ≥2 条真实要点。`
                  : '') +
                (fillErr && /材料未覆盖|口径未标注|检索诊断|元话语/.test(fillErr)
                  ? `\n【禁元话语】禁止 tip 写「材料未覆盖/口径未标注/仅见一项/无法定位」；材料薄时写可执行短动作（回查属性页、对照爆款图鉴）。`
                  : '') +
                (attempt && fillErr
                  ? `\n【重试】上一版不合格：${fillErr}。只改本页 tips，补齐契约要求。`
                  : '');
              try {
                fillAttempts += 1;
                const {content: fillRaw, evidence} = await runOnceWithModel(
                  fillSys,
                  fillUser,
                  model,
                  {stage: 'fill', title: slTitle},
                );
                console.log(
                  'ppt-outline-slide-fill-raw',
                  ci,
                  si,
                  attempt,
                  model,
                  layout,
                  fillRaw?.slice?.(0, 280),
                  'evidenceChars',
                  evidence?.length || 0,
                );
                const parsed = parseFilledSlideFromModel(
                  fillRaw,
                  slTitle,
                  normalizeSlideLayout(layout),
                  slidesOut,
                  si,
                  evidence,
                );
                if (parsed.ok) {
                  filledSlide = parsed.value;
                  if (fidelityHitOnSlide && fillAttempts > 1) {
                    timing.fidelityRecovered += 1;
                  }
                } else {
                  fillErr = parsed.msg;
                  if (/张冠李戴|未对齐|不忠实|大盘口径|表头与数据分家/.test(fillErr)) {
                    timing.fidelityRejects += 1;
                    fidelityHitOnSlide = true;
                  }
                  if (!downgraded) {
                    let nextLay: OutlineJsonLayout | null = null;
                    if (
                      isMetricScarceErr(fillErr) &&
                      (layout === 'metric' ||
                        layout === 'metric_list' ||
                        layout === 'metric_columns')
                    ) {
                      const coerced = coerceLayoutBySlideTitle(slTitle, layout);
                      nextLay =
                        coerced !== layout &&
                        coerced !== 'metric' &&
                        coerced !== 'metric_list' &&
                        coerced !== 'metric_columns'
                          ? coerced
                          : 'list';
                    } else if (
                      (isColumnsEmptyErr(fillErr) ||
                        isSparseTipsErr(fillErr) ||
                        /改用 list|宜短标签/.test(fillErr)) &&
                      layout !== 'list'
                    ) {
                      // 分栏写不出（含总览过长）→ 允许降 list，校验不再禁止
                      nextLay = 'list';
                    }
                    if (nextLay && nextLay !== layout) {
                      layout = nextLay;
                      layouts![si] = layout;
                      slidesOut[si] = {...slidesOut[si], layout, tips: []};
                      siblingTitles = ch.slides
                        .map((s, i) => `${i + 1}. ${s.title} → ${layouts![i]}`)
                        .join('\n');
                      downgraded = true;
                      console.warn(
                        'ppt-outline-slide-layout-downgrade',
                        slTitle,
                        fillErr,
                        '→',
                        layout,
                      );
                    }
                  }
                }
              } catch (e: any) {
                fillErr = e?.message || '填充失败';
              }
            }
            timing.slides.push({
              chapter: ch.title,
              title: slTitle,
              layout,
              ms: msSince(slideT0),
              attempts: fillAttempts,
              ok: !!filledSlide,
            });
            if (!filledSlide) {
              failProgress();
              logTimingSummary('fill-failed');
              const errText =
                `大纲填充失败：章「${ch.title}」页「${slTitle}」（${layout}）多次重试仍不合格` +
                (fillErr ? `（${fillErr}）` : '') +
                `。请换具体知识库后重试，或简化该页主题后再生成。`;
              console.warn('ppt-outline-slide-fill-failed', ch.title, slTitle, fillErr);
              return new Response(
                new ReadableStream({
                  start(controller) {
                    controller.enqueue(encoder.encode(errText));
                    controller.close();
                  },
                }),
              );
            }
            slidesOut[si] = filledSlide;
            layouts![si] = normalizeSlideLayout(filledSlide.layout);
            progressDone += 1;
            reportProgress(
              `已完成 ${Math.min(progressDone, progressTotal)}/${progressTotal} 步`,
            );
          }

          filledChapters.push({
            title: ch.title,
            subtitle: ch.subtitle,
            slides: slidesOut,
          });
        }

        const filledMd = filledToMarkdown({
          title: docTitle,
          chapters: filledChapters,
        });

        console.log('ppt-outline-pipeline', {
          pack,
          docTitle,
          chapters: filledChapters.length,
          filledLen: filledMd.length,
        });
        logTimingSummary('ok');

        finishProgress('大纲构思完成');

        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(filledMd));
              controller.close();
            },
          }),
        );
      }}
      userMeta={{
        avatar: '/avart.svg',
        title: '毕方',
      }}
      assistantMeta={{
        avatar: '/robot.svg',
        title: '小毕',
      }}
    />
    </div>
  )
}
export default ChatWithSpeech4Ppt;
