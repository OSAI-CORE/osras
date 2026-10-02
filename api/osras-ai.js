const MODEL =
    "gemini-2.5-flash-lite";


/*
 * =====================================================
 * OSRAS Smart Assist
 * Google Search Grounding 證據整理
 * =====================================================
 */
function extractGroundingEvidence(
    data
) {

    const candidate =
        data?.candidates?.[0] || {};

    const metadata =
        candidate?.groundingMetadata || {};

    const searchQueries =
        Array.isArray(
            metadata?.webSearchQueries
        )
            ? metadata.webSearchQueries
            : [];


    const sourceMap =
        new Map();


    const groundingChunks =
        Array.isArray(
            metadata?.groundingChunks
        )
            ? metadata.groundingChunks
            : [];


    groundingChunks.forEach(
        chunk => {

            const web =
                chunk?.web;

            if (
                !web?.uri
            ) {
                return;
            }


            if (
                sourceMap.has(
                    web.uri
                )
            ) {
                return;
            }


            sourceMap.set(
                web.uri,
                {
                    title:
                        String(
                            web.title || ""
                        ),

                    uri:
                        String(
                            web.uri || ""
                        )
                }
            );
        }
    );


    return {
        searched:
            searchQueries.length > 0 ||
            sourceMap.size > 0,

        searchQueries,

        sources:
            Array.from(
                sourceMap.values()
            )
    };
}

export default async function handler(
    req,
    res
) {

    /*
     * =====================================================
     * OSRAS Smart Assist CORS
     *
     * Vercel Environment Variables：
     *
     * OSRAS_ALLOWED_ORIGINS
     *
     * 多個網址使用逗號分隔。
     * =====================================================
     */
    const allowedOrigins =
        String(
            process.env
                .OSRAS_ALLOWED_ORIGINS ||
            ""
        )
            .split(",")
            .map(
                value =>
                    value.trim()
            )
            .filter(Boolean);


    const requestOrigin =
        String(
            req.headers.origin || ""
        ).trim();


    const originAllowed =
        !requestOrigin ||
        allowedOrigins.includes(
            requestOrigin
        );


    if (
        requestOrigin &&
        originAllowed
    ) {

        res.setHeader(
            "Access-Control-Allow-Origin",
            requestOrigin
        );

        res.setHeader(
            "Vary",
            "Origin"
        );
    }


    res.setHeader(
        "Access-Control-Allow-Methods",
        "POST, OPTIONS"
    );


    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );


    if (
        req.method === "OPTIONS"
    ) {

        return res
            .status(204)
            .end();
    }


    if (
        requestOrigin &&
        !originAllowed
    ) {

        return res.status(403).json({
            error:
                "Origin not allowed"
        });
    }


    if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const action = String(body.action || "").trim();

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "缺少 GEMINI_API_KEY，請到 Vercel Environment Variables 設定"
      });
    }

    if (!action) {
      return res.status(400).json({
        error: "缺少 action，可用值：generateRow / controlProposal / audit",
        receivedBody: body
      });
    }

    let prompt = "";

if (action === "generateRow") {

    const jobTitle =
        String(
            body.jobTitle || ""
        ).trim();


    const localDraft =
        body.localDraft &&
        typeof body.localDraft === "object"
            ? body.localDraft
            : null;

      if (!jobTitle) {
        return res.status(400).json({
          error: "缺少 jobTitle"
        });
      }

prompt = `你是一位專業 ISO 45001 職業安全衛生管理師、
風險評估專家與台灣職業安全衛生法規查核專家。

作業名稱：
「${jobTitle}」

以下為 OSRAS Local Intelligence Core
依本地資料庫、風險規則、資格規則與 Dynamic Fallback
產生的初步結果：

${localDraft
    ? JSON.stringify(localDraft)
    : "目前沒有本地初稿"}

你的角色不是重新從零生成，
而是利用 Google Search 進行「查證、比對與必要補強」。

【重要原則】

1. Local Core 為第一層結果。
2. 搜尋只負責修正明確錯誤或補充有可靠依據的內容。
3. 不得僅因搜尋到相似案例，就假設本作業具有相同設備容量、
   電壓、化學品濃度、作業高度、設備型式或現場控制。
4. 無法由作業名稱或搜尋資料確認的現場事實，不得自行杜撰。
5. 法定資格、證照、作業主管或訓練：
   只有適用條件相對明確時才能直接判定。
6. 若法定資格仍取決於設備容量、荷重、型式、材質、
   電壓、能量或其他現場條件，checked 必須維持 false。
7. 搜尋法規時優先採用台灣政府、法規資料庫、
   勞動部及職業安全衛生相關官方來源。
8. 不確定法條或條號時，不得猜測。
9. S、P 僅限 1 至 4。
10. 控制措施固定使用五個控制層級：
    消除、取代、工程控制、管理控制、個人防護具。
11. 不得因加入 PPE 就不合理大幅降低風險。

請輸出修正後完整資料。

只輸出純 JSON，不要 markdown、不要說明文字。

{
  "job_title": "${jobTitle}",
  "cycle": "經常性或非經常性",
  "environment": "作業環境",
  "machinery": "機械／設備",
  "chemical": "能源／化學品",

  "qualification": {
    "checked": false,
    "license": "法定資格、必要訓練或相關訓練名稱；沒有則填無",
    "requirementType": "qualification / training / mandatory-training / conditional-statutory / none"
  },

  "hazard_type": "主要危害類型",

  "scenario": "事故可能造成之自然敘述情境",

  "existing_eng": "現有工程控制",
  "existing_admin": "現有管理控制",
  "existing_ppe": "現有個人防護具",

  "severity_1": 1,
  "probability_1": 1,

  "control_proposal": "消除：...\\n取代：...\\n工程控制：...\\n管理控制：...\\n個人防護具：...",

  "severity_2": 1,
  "probability_2": 1
}`;
    }

    else if (action === "controlProposal") {
      const row = body.row || {};

      if (!row.job_title) {
        return res.status(400).json({
          error: "缺少 row.job_title",
          receivedRow: row
        });
      }

      prompt = `你是一位專業職業安全工程師與 ISO 45001 風險控制專家。

請根據以下職安風險評估資料，產生符合 Hierarchy of Controls 的降低風險控制措施。

請注意：
1. 優先考量消除、取代、工程控制。
2. 不可只用 PPE 就大幅降低風險。
3. 控制後嚴重度 severity_2 與可能性 probability_2 必須合理。
4. 嚴重度與可能性只能是 1-4 的整數。
5. 必須依序評估：
   消除 → 取代 → 工程控制 → 管理控制 → 個人防護具。

6. 若消除或取代依目前資料無法確認可行，
   可以說明評估方向，但不得虛構現場可以直接採行。

7. 請使用 Google Search 查證設備安全控制、
   專業作法及必要法規背景。

8. 網路搜尋結果只能作為補強依據，
   不得取代目前 row 中已確認的現場資料。

待分析資料：
${JSON.stringify(row)}

請只輸出純 JSON，不要 markdown，不要說明文字。

JSON 格式如下：
{
  "control_proposal": "消除：...\\n取代：...\\n工程控制：...\\n管理控制：...\\n個人防護具：...",
  "severity_2": 1,
  "probability_2": 1,
  "reason": "簡短說明為何如此調整控制後風險"
}`;
    }

    else if (action === "audit") {
      const rows = Array.isArray(body.rows) ? body.rows : [];

      if (rows.length === 0) {
        return res.status(400).json({
          error: "缺少 rows，或 rows 為空陣列"
        });
      }

prompt = `你是一位具實務經驗的 ISO 45001、
職業安全衛生風險評估與台灣職安法規稽核專家。

請對以下職業安全危害辨識與風險評估資料
進行專業、審慎且務實的深度稽核。

本次稽核目的，是找出真正會影響：
風險判斷、控制有效性、資格要求、
法規適用性或重要資料完整性的問題。

不得因文字風格、句型、長短或非必要細節不同，
就刻意產生缺失。

【基本判斷原則】

1. 作業名稱、危害類型、事故情境與控制措施
   必須具有合理關聯。

2. severity 與 probability 僅限 1 至 4，
   並確認控制後風險沒有不合理高於初始風險。

3. 控制後嚴重度維持不變、
   主要降低可能性，屬常見且合理的風險降低方式。

4. 控制措施應依 Hierarchy of Controls 評估：
   消除、取代、工程控制、管理控制、個人防護具。

5. 若消除或取代依現有資料無法確認可行，
   但已有合理工程、管理與個人防護措施，
   不得只因未採用消除或取代就判定為缺失。

6. 不得因增加 PPE，
   就不合理大幅降低控制後風險。

【資格與法定條件】

7. 只有現有資料已足以確認法定資格、
   特殊作業人員、作業主管或必要訓練確實適用，
   而目前資料又明顯缺漏、錯誤或矛盾時，
   才列為 warning。

8. 如果是否適用仍取決於設備容量、荷重、
   型式、電壓、能量、材質、化學品種類、
   作業高度或其他現場條件，
   不得列為 warning 或 critical。

   此時使用：
   level = "info"
   type = "現場條件確認"

9. 若使用者已勾選法定資格證照，
   且資格欄已填入明確的人員資格、
   作業主管、技術人員、證書或執照名稱，
   應視為使用者已依現場條件完成確認。

   不得只因系統先前建議為一般訓練，
   就再次判定為 warning。

10. 只有實際填寫內容仍明顯屬於
    教育訓練、講習或一般訓練名稱，
    卻勾選為法定資格證照時，
    才可判定為資格／訓練勾選不一致。

【問題等級】

11. 下列情況可列為 warning：
    - 已有控制措施，但明顯不足以支持控制後風險。
    - 控制後風險下降幅度明顯不合理。
    - 現有資料已足以確認法定要求，
      但資格或訓練內容明顯缺漏或錯誤。
    - 重要欄位內容與作業危害明顯不一致。

12. critical 僅用於明顯重大問題，例如：
    - 高度或重大風險完全沒有改善控制措施。
    - 僅依賴 PPE 或極少量管理措施，
      卻把高度風險直接降至極低風險。
    - 控制後風險反而高於初始風險，
      且沒有合理原因。
    - 明顯重大危害缺少必要核心控制。
    - 核心資料缺失到無法完成合理風險判斷。

13. 若只是現場條件尚未提供，
    但目前資料本身沒有明顯錯誤，
    使用 info，不得升級為 warning。

【避免過度稽核】

14. 不需要為每一個項次產生問題。

15. 同一項次可存在多個真正不同的重要問題，
    但相同核心原因不得換句話重複列出。

16. 「可以再更好」不等於缺失。

17. 如果整份資料合理完整，
    可以直接判定通過。

18. 如果已回傳任何 critical、warning 或 info，
    不要再另外回傳 success。

【法規查核】

19. 可使用 AI 搜尋協助確認設備安全要求、
    專業作法與台灣職安法規。

20. 優先參考台灣政府、全國法規資料庫、
    勞動部與職業安全衛生相關官方資料。

21. 搜尋結果只能作為查證與補強依據，
    不得用搜尋到的其他案例推定本案具有
    相同設備容量、電壓、材質、濃度或現場配置。

22. 不確定法規是否適用或不確定條號時，
    不得猜測。

【輸出格式】

請只輸出純 JSON 陣列，
不要 markdown、不要額外說明。

[
  {
    "rowId": "項次",
    "level": "critical/warning/info/success",
    "type": "缺失類別",
    "msg": "問題說明",
    "suggestion": "具體改善建議",
    "regulation": "適用法規或查核方向，無法確認則填無"
  }
]

rowId 必須使用資料中的正式 rowId。
internalRowId 僅供系統內部追蹤，
不得出現在稽核報告中。

若完全沒有明顯問題，回傳：

[
  {
    "rowId": "All",
    "level": "success",
    "type": "審查通過",
    "msg": "未發現明顯邏輯瑕疵",
    "suggestion": "",
    "regulation": "無"
  }
]

待稽核資料：
${JSON.stringify(rows)}`;

    }

    else {
      return res.status(400).json({
        error: "不支援的 action",
        allowedActions: ["generateRow", "controlProposal", "audit"]
      });
    }

const payload = {

    contents: [
        {
            role:
                "user",

            parts: [
                {
                    text:
                        prompt
                }
            ]
        }
    ],


    /*
     * Gemini Google Search Grounding
     *
     * 模型會自行判斷是否需要搜尋，
     * 不代表每次一定發出搜尋查詢。
     */
    tools: [
        {
            google_search: {}
        }
    ],


generationConfig: {

    temperature:
        0.2,

    maxOutputTokens:
        action === "audit"
            ? 4096
            : 3072
}
};

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
  {
    method:
      "POST",

    headers: {
      "Content-Type":
        "application/json",

      "x-goog-api-key":
        process.env.GEMINI_API_KEY
    },

    body:
      JSON.stringify(
        payload
      )
  }
);

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API Error:", JSON.stringify(data, null, 2));

      return res.status(response.status).json({
        error: data.error || data,
        model: MODEL
      });
    }

let rawText =
    (
        data
            ?.candidates
            ?.[0]
            ?.content
            ?.parts || []
    )
        .map(
            part =>
                typeof part?.text === "string"
                    ? part.text
                    : ""
        )
        .join("")
        .trim();


rawText = rawText
    .replace(
        /```json/gi,
        ""
    )
    .replace(
        /```/g,
        ""
    )
    .trim();


if (
    !rawText
) {

    return res.status(502).json({
        error:
            "AI 未回傳可解析的文字內容",

        model:
            MODEL,

        grounding:
            extractGroundingEvidence(
                data
            )
    });
}

    let result;

    try {
      result = JSON.parse(rawText);
    } catch (parseError) {
      return res.status(500).json({
        error: "AI 回傳 JSON 解析失敗",
        rawText,
        model: MODEL
      });
    }

const grounding =
    extractGroundingEvidence(
        data
    );


return res.status(200).json({

    ok:
        true,

    action,

    model:
        MODEL,

    result,

    grounding
});
  } catch (error) {
    console.error("Server Error:", error);

    return res.status(500).json({
      error: error.message,
      model: MODEL
    });
  }
}
